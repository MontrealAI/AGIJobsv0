// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {TokenAcknowledgement} from "../utils/TokenAcknowledgement.sol";

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

    /// @notice total locked stake for each participant.
    mapping(address => uint256) private _lockedStakes;

    /// @notice per-job locked stake for each participant.
    mapping(address => mapping(uint256 => uint256)) private _jobLocks;

    /// @notice active job ids for each participant used to prune locks on slash.
    mapping(address => uint256[]) private _activeLocks;

    /// @notice index tracker for active locks (index + 1 to differentiate missing entries).
    mapping(address => mapping(uint256 => uint256)) private _lockIndex;

    /// @notice queued withdrawals and slash rewards awaiting manual claim.
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice addresses allowed to operate on behalf of stakers (e.g. JobRegistry).
    mapping(address => bool) public operators;

    event OperatorUpdated(address indexed operator, bool allowed);
    event StakeDeposited(address indexed who, uint256 amount);
    event StakeWithdrawn(address indexed who, uint256 amount);
    event WithdrawalClaimed(address indexed who, uint256 amount);
    event StakeLocked(address indexed operator, address indexed who, uint256 indexed jobId, uint256 amount);
    event StakeUnlocked(address indexed operator, address indexed who, uint256 indexed jobId, uint256 amount);
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
        TokenAcknowledgement.acknowledge(address(token_), address(this));
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

    /// @notice Total locked stake for a participant.
    function lockedStakeOf(address who) external view returns (uint256) {
        return _lockedStakes[who];
    }

    /// @notice Locked stake for a participant dedicated to a specific job.
    function lockedStakeForJob(address who, uint256 jobId) external view returns (uint256) {
        return _jobLocks[who][jobId];
    }

    /// @notice Available stake that can be withdrawn or re-locked.
    function availableStakeOf(address who) public view returns (uint256) {
        uint256 stake = _stakes[who];
        uint256 locked = _lockedStakes[who];
        if (stake <= locked) return 0;
        return stake - locked;
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
        if (availableStakeOf(who) < amount) revert InsufficientStake();
        _stakes[who] = balance - amount;
        pendingWithdrawals[who] += amount;
        emit StakeWithdrawn(who, amount);
    }

    /// @notice Lock stake for a specific job preventing premature withdrawals.
    function lockStake(address who, uint256 jobId, uint256 amount) external {
        if (!operators[msg.sender]) revert NotAuthorized();
        if (who == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 available = availableStakeOf(who);
        if (available < amount) revert InsufficientStake();

        _jobLocks[who][jobId] += amount;
        _lockedStakes[who] += amount;

        if (_lockIndex[who][jobId] == 0) {
            _activeLocks[who].push(jobId);
            _lockIndex[who][jobId] = _activeLocks[who].length;
        }

        emit StakeLocked(msg.sender, who, jobId, amount);
    }

    /// @notice Unlock a portion of stake reserved for a job.
    function unlockStake(address who, uint256 jobId, uint256 amount) external {
        if (!operators[msg.sender]) revert NotAuthorized();
        if (who == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 lockedAmount = _jobLocks[who][jobId];
        if (lockedAmount < amount) revert InsufficientStake();

        _jobLocks[who][jobId] = lockedAmount - amount;
        _lockedStakes[who] -= amount;

        if (_jobLocks[who][jobId] == 0) {
            _removeLock(who, jobId);
        }

        emit StakeUnlocked(msg.sender, who, jobId, amount);
    }

    /// @notice Unlock the entire stake reserved for a job.
    function unlockAll(address who, uint256 jobId) external {
        if (!operators[msg.sender]) revert NotAuthorized();
        if (who == address(0)) revert ZeroAddress();

        uint256 lockedAmount = _jobLocks[who][jobId];
        if (lockedAmount == 0) {
            return;
        }

        _jobLocks[who][jobId] = 0;
        _lockedStakes[who] -= lockedAmount;
        _removeLock(who, jobId);

        emit StakeUnlocked(msg.sender, who, jobId, lockedAmount);
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
        _normalizeLocks(who);
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

    function _removeLock(address who, uint256 jobId) internal {
        uint256 indexPlusOne = _lockIndex[who][jobId];
        if (indexPlusOne == 0) return;

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _activeLocks[who].length - 1;

        if (index != lastIndex) {
            uint256 lastJobId = _activeLocks[who][lastIndex];
            _activeLocks[who][index] = lastJobId;
            _lockIndex[who][lastJobId] = index + 1;
        }

        _activeLocks[who].pop();
        _lockIndex[who][jobId] = 0;
    }

    function _normalizeLocks(address who) internal {
        uint256 stake = _stakes[who];
        uint256 locked = _lockedStakes[who];
        if (locked <= stake) return;

        uint256 excess = locked - stake;
        uint256[] storage jobIds = _activeLocks[who];

        while (excess > 0 && jobIds.length > 0) {
            uint256 lastIdx = jobIds.length - 1;
            uint256 jobId = jobIds[lastIdx];
            uint256 lockedAmount = _jobLocks[who][jobId];

            uint256 deduction = lockedAmount > excess ? excess : lockedAmount;
            _jobLocks[who][jobId] = lockedAmount - deduction;
            _lockedStakes[who] -= deduction;
            excess -= deduction;

            if (_jobLocks[who][jobId] == 0) {
                jobIds.pop();
                _lockIndex[who][jobId] = 0;
            }
        }

        if (excess != 0) {
            // Should be unreachable, but guard against inconsistent accounting.
            revert InsufficientStake();
        }
    }
}
