// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IStakeManager} from "../interfaces/IStakeManager.sol";

/// @title StakeManager (module)
/// @notice Minimal stake escrow with role based accounting and slashing.
/// @dev Only participants bear any tax obligations; this contract remains
/// tax neutral and rejects any direct ETH transfers.
contract StakeManager is Ownable, ReentrancyGuard, IStakeManager {
    using SafeERC20 for IERC20;

    IERC20 public token; // staking token

    // minimum stake requirement per role
    uint256 public agentMinStake;
    uint256 public validatorMinStake;

    // slashing percentage per role (in basis points out of 100)
    uint256 public agentSlashingPercentage;
    uint256 public validatorSlashingPercentage;

    // user => role => total staked amount
    mapping(address => mapping(Role => uint256)) private _stakes;
    // user => role => locked amount
    mapping(address => mapping(Role => uint256)) private _locked;

    event StakeReleased(address indexed user, Role indexed role, uint256 amount);

    constructor(IERC20 _token, address owner) Ownable(owner) {
        token = _token;
        emit TokenUpdated(address(_token));
    }

    // ---------------------- owner configuration ----------------------

    /// @notice Update the staking token address.
    function setToken(address newToken) external onlyOwner {
        token = IERC20(newToken);
        emit TokenUpdated(newToken);
    }

    /// @notice Set minimum stakes and slashing percentages for both roles.
    function setStakeParameters(
        uint256 _agentMinStake,
        uint256 _validatorMinStake,
        uint256 _agentSlashPct,
        uint256 _validatorSlashPct
    ) external onlyOwner {
        agentMinStake = _agentMinStake;
        validatorMinStake = _validatorMinStake;
        agentSlashingPercentage = _agentSlashPct;
        validatorSlashingPercentage = _validatorSlashPct;
        emit ParametersUpdated();
    }

    // ------------------------ staking logic -------------------------

    /// @notice Deposit stake for the caller for a specific role.
    function deposit(Role role, uint256 amount) public nonReentrant {
        require(amount > 0, "amount");
        _stakes[msg.sender][role] += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit StakeDeposited(msg.sender, role, amount);
    }

    /// @inheritdoc IStakeManager
    function depositStake(Role role, uint256 amount) external override {
        deposit(role, amount);
    }

    /// @notice Withdraw available stake for the caller.
    function withdraw(Role role, uint256 amount) public nonReentrant {
        uint256 available = _stakes[msg.sender][role] - _locked[msg.sender][role];
        require(available >= amount, "insufficient stake");
        _stakes[msg.sender][role] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, role, amount);
    }

    /// @inheritdoc IStakeManager
    function withdrawStake(Role role, uint256 amount) external override {
        withdraw(role, amount);
    }

    /// @notice Lock stake of a user for a role.
    function lockStake(address user, Role role, uint256 amount)
        public
        override
        onlyOwner
        nonReentrant
    {
        uint256 minStake =
            role == Role.Agent ? agentMinStake : validatorMinStake;
        require(amount >= minStake, "below min");
        uint256 available = _stakes[user][role] - _locked[user][role];
        require(available >= amount, "insufficient");
        _locked[user][role] += amount;
        emit StakeLocked(user, role, amount);
    }

    /// @notice Release previously locked stake.
    function releaseStake(address user, Role role, uint256 amount)
        public
        onlyOwner
        nonReentrant
    {
        require(_locked[user][role] >= amount, "locked");
        _locked[user][role] -= amount;
        emit StakeReleased(user, role, amount);
    }

    /// @notice Slash locked stake and send penalty to employer.
    function slash(
        address user,
        Role role,
        uint256 amount,
        address employer
    )
        public
        override
        onlyOwner
        nonReentrant
    {
        require(_locked[user][role] >= amount, "locked");
        _locked[user][role] -= amount;

        uint256 pct = role == Role.Agent
            ? agentSlashingPercentage
            : validatorSlashingPercentage;
        uint256 penalty = (amount * pct) / 100;

        if (penalty > 0) {
            _stakes[user][role] -= penalty;
            token.safeTransfer(employer, penalty);
        }

        emit StakeSlashed(user, role, penalty, employer, address(0));
    }

    // ------------------------- view helpers -------------------------

    /// @inheritdoc IStakeManager
    function stakeOf(address user, Role role)
        external
        view
        override
        returns (uint256)
    {
        return _stakes[user][role];
    }

    /// @inheritdoc IStakeManager
    function lockedStakeOf(address user, Role role)
        external
        view
        override
        returns (uint256)
    {
        return _locked[user][role];
    }
    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("StakeManager: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("StakeManager: no ether");
    }
}

