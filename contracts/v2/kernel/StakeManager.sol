// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title KernelStakeManager
/// @notice Minimal staking contract shared by agents and validators.
/// @dev Funds remain in the contract until explicitly claimed, implementing a
///      pull-payment flow that mitigates reentrancy vectors.
contract KernelStakeManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable stakingToken;

    /// @notice staking balance for each participant.
    mapping(address => uint256) private _stakes;

    /// @notice queued withdrawals and slash rewards awaiting manual claim.
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice addresses allowed to operate on behalf of stakers (e.g. JobRegistry).
    mapping(address => bool) public operators;

    event OperatorUpdated(address indexed operator, bool allowed);
    event StakeDeposited(address indexed who, uint256 amount);
    event StakeWithdrawn(address indexed who, uint256 amount);
    event WithdrawalClaimed(address indexed who, uint256 amount);
    event StakeSlashed(
        address indexed who,
        uint256 bps,
        address indexed beneficiary,
        string reason,
        uint256 amount
    );

    error ZeroAddress();
    error ZeroAmount();
    error NotAuthorized();
    error InvalidBps();
    error InsufficientStake();

    constructor(IERC20 token_, address owner_) Ownable(owner_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        stakingToken = token_;
    }

    /// @notice Allow governance to authorize or revoke operator permissions.
    function setOperator(address operator, bool allowed) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        operators[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }

    /// @notice Current stake for a participant.
    function stakeOf(address who) external view returns (uint256) {
        return _stakes[who];
    }

    /// @notice Deposit $AGIALPHA for `who`.
    /// @param who Address receiving the staked balance.
    /// @param amount Token amount to deposit.
    function deposit(address who, uint256 amount) external nonReentrant {
        if (who == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (msg.sender != who && !operators[msg.sender]) revert NotAuthorized();

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        _stakes[who] += amount;
        emit StakeDeposited(who, amount);
    }

    /// @notice Queue a withdrawal for `who` and move the balance into
    ///         `pendingWithdrawals`.
    /// @param who Address whose stake is being withdrawn.
    /// @param amount Amount of stake to withdraw.
    function withdraw(address who, uint256 amount) external nonReentrant {
        if (who == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (msg.sender != who && !operators[msg.sender]) revert NotAuthorized();

        uint256 balance = _stakes[who];
        if (balance < amount) revert InsufficientStake();
        _stakes[who] = balance - amount;
        pendingWithdrawals[who] += amount;
        emit StakeWithdrawn(who, amount);
    }

    /// @notice Slash a percentage of stake from `who` and credit the
    ///         beneficiary's withdrawal balance.
    /// @param who Address being slashed.
    /// @param bps Basis points of the stake to slash (max 10_000).
    /// @param beneficiary Recipient credited with the slashed amount.
    /// @param reason Human readable reason for observability.
    function slash(address who, uint256 bps, address beneficiary, string calldata reason)
        external
        nonReentrant
    {
        if (!operators[msg.sender]) revert NotAuthorized();
        if (who == address(0) || beneficiary == address(0)) revert ZeroAddress();
        if (bps == 0 || bps > BPS_DENOMINATOR) revert InvalidBps();

        uint256 balance = _stakes[who];
        if (balance == 0) revert InsufficientStake();
        uint256 amount = (balance * bps) / BPS_DENOMINATOR;
        if (amount == 0) revert InsufficientStake();

        _stakes[who] = balance - amount;
        pendingWithdrawals[beneficiary] += amount;
        emit StakeSlashed(who, bps, beneficiary, reason, amount);
    }

    /// @notice Claim accumulated withdrawals and slash rewards.
    function claim() external nonReentrant returns (uint256 amount) {
        amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert ZeroAmount();
        pendingWithdrawals[msg.sender] = 0;
        stakingToken.safeTransfer(msg.sender, amount);
        emit WithdrawalClaimed(msg.sender, amount);
    }
}
