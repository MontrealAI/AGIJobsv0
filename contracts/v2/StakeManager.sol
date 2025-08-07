// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StakeManager
/// @notice Manages staking for agents and validators with role-based locking and slashing.
contract StakeManager is Ownable {
    using SafeERC20 for IERC20;

    enum Role { Agent, Validator }

    IERC20 public token;

    mapping(address => uint256) public agentStakes;
    mapping(address => uint256) public validatorStakes;
    mapping(address => uint256) public lockedAgentStakes;
    mapping(address => uint256) public lockedValidatorStakes;

    mapping(address => bool) public callers;

    event TokenUpdated(address token);
    event CallerAuthorized(address indexed caller, bool allowed);
    event StakeDeposited(address indexed user, Role indexed role, uint256 amount);
    event StakeWithdrawn(address indexed user, Role indexed role, uint256 amount);
    event StakeLocked(address indexed user, Role indexed role, uint256 amount);
    event StakeSlashed(
        address indexed user,
        Role indexed role,
        uint256 amount,
        address indexed recipient
    );

    constructor(IERC20 _token, address owner) Ownable(owner) {
        token = _token;
        emit TokenUpdated(address(_token));
    }

    modifier onlyCaller() {
        require(callers[msg.sender], "not authorized");
        _;
    }

    function setCaller(address caller, bool allowed) external onlyOwner {
        callers[caller] = allowed;
        emit CallerAuthorized(caller, allowed);
    }

    function setToken(IERC20 newToken) external onlyOwner {
        token = newToken;
        emit TokenUpdated(address(newToken));
    }

    function depositStake(Role role, uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (role == Role.Agent) {
            agentStakes[msg.sender] += amount;
        } else {
            validatorStakes[msg.sender] += amount;
        }
        emit StakeDeposited(msg.sender, role, amount);
    }

    function withdrawStake(Role role, uint256 amount) external {
        if (role == Role.Agent) {
            uint256 available = agentStakes[msg.sender] - lockedAgentStakes[msg.sender];
            require(available >= amount, "insufficient stake");
            agentStakes[msg.sender] -= amount;
        } else {
            uint256 available = validatorStakes[msg.sender] - lockedValidatorStakes[msg.sender];
            require(available >= amount, "insufficient stake");
            validatorStakes[msg.sender] -= amount;
        }
        token.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, role, amount);
    }

    function lockStake(address user, Role role, uint256 amount) external onlyCaller {
        if (role == Role.Agent) {
            uint256 available = agentStakes[user] - lockedAgentStakes[user];
            require(available >= amount, "insufficient stake");
            lockedAgentStakes[user] += amount;
        } else {
            uint256 available = validatorStakes[user] - lockedValidatorStakes[user];
            require(available >= amount, "insufficient stake");
            lockedValidatorStakes[user] += amount;
        }
        emit StakeLocked(user, role, amount);
    }

    function slashStake(address user, Role role, uint256 amount, address recipient)
        external
        onlyCaller
    {
        if (role == Role.Agent) {
            require(lockedAgentStakes[user] >= amount, "insufficient locked");
            lockedAgentStakes[user] -= amount;
            agentStakes[user] -= amount;
        } else {
            require(lockedValidatorStakes[user] >= amount, "insufficient locked");
            lockedValidatorStakes[user] -= amount;
            validatorStakes[user] -= amount;
        }
        token.safeTransfer(recipient, amount);
        emit StakeSlashed(user, role, amount, recipient);
    }
}

