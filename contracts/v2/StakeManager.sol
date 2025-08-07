// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IStakeManager} from "./interfaces/IStakeManager.sol";

/// @title StakeManager
/// @notice Handles staking for agents and validators with role-based locking and slashing
contract StakeManager is IStakeManager, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public token;
    address public treasury;

    // percentage settings
    uint256 public agentStakePercentage = 20; // 20% of payout
    uint256 public validatorStakePercentage = 10; // 10% of payout
    uint256 public validatorSlashingPercentage = 50; // 50% of stake

    // user => role => amount
    mapping(address => mapping(Role => uint256)) private _stakes;
    mapping(address => mapping(Role => uint256)) private _locked;

    constructor(IERC20 _token, address _treasury, address owner) Ownable(owner) {
        token = _token;
        treasury = _treasury;
        emit TokenUpdated(address(_token));
    }

    /// @notice Update the ERC20 token used for staking and rewards
    function setToken(address newToken) external onlyOwner {
        token = IERC20(newToken);
        emit TokenUpdated(newToken);
    }

    /// @notice Update stake and slashing parameters
    function setStakeParameters(
        uint256 _agentStakePct,
        uint256 _validatorStakePct,
        uint256 _validatorSlashPct
    ) external onlyOwner {
        agentStakePercentage = _agentStakePct;
        validatorStakePercentage = _validatorStakePct;
        validatorSlashingPercentage = _validatorSlashPct;
        emit ParametersUpdated();
    }

    /// @notice Deposit stake for the caller under a specific role
    function depositStake(Role role, uint256 amount) external nonReentrant {
        token.safeTransferFrom(msg.sender, address(this), amount);
        _stakes[msg.sender][role] += amount;
        emit StakeDeposited(msg.sender, role, amount);
    }

    /// @notice Withdraw stake for the caller
    function withdrawStake(Role role, uint256 amount) external nonReentrant {
        uint256 available = _stakes[msg.sender][role] - _locked[msg.sender][role];
        require(available >= amount, "insufficient stake");
        _stakes[msg.sender][role] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, role, amount);
    }

    /// @notice Lock stake for a user and role
    function lockStake(address user, Role role, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        uint256 available = _stakes[user][role] - _locked[user][role];
        require(available >= amount, "insufficient stake");
        _locked[user][role] += amount;
        emit StakeLocked(user, role, amount);
    }

    /// @notice Slash locked stake and distribute to employer and treasury
    function slash(
        address user,
        Role role,
        uint256 amount,
        address employer
    ) external onlyOwner nonReentrant {
        require(_locked[user][role] >= amount, "insufficient locked");
        _locked[user][role] -= amount;
        _stakes[user][role] -= amount;
        uint256 half = amount / 2;
        token.safeTransfer(employer, half);
        token.safeTransfer(treasury, amount - half);
        emit StakeSlashed(user, role, amount, employer, treasury);
    }

    /// @notice Get total stake for a user and role
    function stakeOf(address user, Role role) external view returns (uint256) {
        return _stakes[user][role];
    }

    /// @notice Get locked stake for a user and role
    function lockedStakeOf(address user, Role role)
        external
        view
        returns (uint256)
    {
        return _locked[user][role];
    }
}

