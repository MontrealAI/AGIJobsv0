// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ConstellationStakeManager
/// @notice Minimalist ETH staking module dedicated to the Validator
///         Constellation demo. Validators lock capital to earn voting rights
///         and are automatically slashed when sentinel guardrails detect
///         misbehaviour.
contract ConstellationStakeManager is Ownable, ReentrancyGuard {
    uint256 public constant MAX_BPS = 10_000;

    mapping(address => uint256) public stakeOf;
    mapping(address => uint256) public lockedUntil;
    mapping(address => bool) public controllers;

    uint256 public minimumStake;
    address public treasury;

    event StakeDeposited(address indexed validator, address indexed funder, uint256 amount, uint256 totalStake);
    event StakeWithdrawn(address indexed validator, uint256 amount, uint256 remainingStake);
    event StakeLocked(address indexed validator, uint256 until);
    event StakeSlashed(address indexed validator, uint256 slashedAmount, address indexed recipient);
    event ControllerUpdated(address indexed controller, bool allowed);
    event TreasuryUpdated(address indexed newTreasury);
    event MinimumStakeUpdated(uint256 newMinimumStake);

    error InvalidAmount();
    error StakeLockedError(uint256 until);
    error UnauthorizedController();
    error InvalidBps();
    error InsufficientStake();
    error InvalidTreasury();

    modifier onlyController() {
        if (!controllers[msg.sender]) revert UnauthorizedController();
        _;
    }

    constructor(uint256 minimumStake_, address treasury_) Ownable(msg.sender) {
        if (treasury_ == address(0)) revert InvalidTreasury();
        minimumStake = minimumStake_;
        treasury = treasury_;
        controllers[msg.sender] = true;
    }

    /// @notice Allow the owner to authorise a controller contract.
    function setController(address controller, bool allowed) external onlyOwner {
        controllers[controller] = allowed;
        emit ControllerUpdated(controller, allowed);
    }

    /// @notice Update the minimum stake requirement.
    function setMinimumStake(uint256 newMinimumStake) external onlyOwner {
        minimumStake = newMinimumStake;
        emit MinimumStakeUpdated(newMinimumStake);
    }

    /// @notice Update the treasury address that receives slashed funds.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidTreasury();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /// @notice Deposit ETH to increase a validator's slashable stake.
    function depositStake(address validator) external payable nonReentrant {
        if (validator == address(0)) revert InvalidAmount();
        if (msg.value == 0) revert InvalidAmount();
        stakeOf[validator] += msg.value;
        emit StakeDeposited(validator, msg.sender, msg.value, stakeOf[validator]);
    }

    /// @notice Withdraw ETH once the validator's lock has expired.
    function withdrawStake(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (block.timestamp < lockedUntil[msg.sender]) revert StakeLockedError(lockedUntil[msg.sender]);
        uint256 stake = stakeOf[msg.sender];
        if (stake < amount) revert InsufficientStake();
        stakeOf[msg.sender] = stake - amount;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "STAKE_WITHDRAW_FAILED");
        emit StakeWithdrawn(msg.sender, amount, stakeOf[msg.sender]);
    }

    /// @notice Lock a validator's stake until a future timestamp.
    function lockStake(address validator, uint256 until) external onlyController {
        if (until < block.timestamp) revert InvalidAmount();
        if (lockedUntil[validator] < until) {
            lockedUntil[validator] = until;
            emit StakeLocked(validator, until);
        }
    }

    /// @notice Slash a validator by a percentage of their stake.
    function slash(address validator, uint256 penaltyBps) external onlyController returns (uint256) {
        if (penaltyBps == 0 || penaltyBps > MAX_BPS) revert InvalidBps();
        uint256 stake = stakeOf[validator];
        if (stake == 0) revert InsufficientStake();
        uint256 amount = (stake * penaltyBps) / MAX_BPS;
        stakeOf[validator] = stake - amount;
        (bool success, ) = treasury.call{value: amount}("");
        require(success, "TREASURY_TRANSFER_FAILED");
        emit StakeSlashed(validator, amount, treasury);
        return amount;
    }
}
