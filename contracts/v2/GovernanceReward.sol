// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";

/// @title GovernanceReward
/// @notice Distributes a portion of the FeePool to voters based on staked balance snapshots.
/// @dev Uses 6‑decimal token amounts. Rewards are funded from the FeePool and
///      allocated proportionally to each recorded voter's stake for the epoch.
contract GovernanceReward is Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant ACCUMULATOR_SCALE = 1e12;

    /// @notice default $AGIALPHA token used when no token is specified
    address public constant DEFAULT_TOKEN =
        0x2e8Fb54C3eC41F55F06C1F082C081a609EaA4ebe;

    /// @notice default epoch length when constructor param is zero
    uint256 public constant DEFAULT_EPOCH_LENGTH = 1 weeks;

    /// @notice default reward percentage when constructor param is zero
    uint256 public constant DEFAULT_REWARD_PCT = 5;

    IERC20 public token;
    IFeePool public feePool;
    IStakeManager public stakeManager;
    IStakeManager.Role public rewardRole;

    uint256 public epochLength;
    uint256 public rewardPct;
    uint256 public currentEpoch;
    uint256 public lastEpochTime;

    /// @notice stake snapshot per voter for an epoch
    mapping(uint256 => mapping(address => uint256)) public stakeSnapshot;
    /// @notice total recorded stake for an epoch
    mapping(uint256 => uint256) public totalStake;
    /// @notice reward per staked token for an epoch scaled by ACCUMULATOR_SCALE
    mapping(uint256 => uint256) public rewardPerStake;
    /// @notice tracks whether a voter was recorded in an epoch
    mapping(uint256 => mapping(address => bool)) public recorded;
    /// @notice tracks whether a voter has claimed for an epoch
    mapping(uint256 => mapping(address => bool)) public claimed;

    event VoterRecorded(uint256 indexed epoch, address indexed voter, uint256 stake);
    event EpochLengthUpdated(uint256 length);
    event RewardPctUpdated(uint256 pct);
    event EpochFinalized(uint256 indexed epoch, uint256 rewardAmount);
    event RewardClaimed(uint256 indexed epoch, address indexed voter, uint256 amount);
    event TokenUpdated(address indexed token);

    constructor(
        IERC20 _token,
        IFeePool _feePool,
        IStakeManager _stakeManager,
        IStakeManager.Role _role,
        uint256 _epochLength,
        uint256 _rewardPct
    ) Ownable(msg.sender) {
        token =
            address(_token) == address(0)
                ? IERC20(DEFAULT_TOKEN)
                : _token;
        emit TokenUpdated(address(token));

        feePool = _feePool;
        stakeManager = _stakeManager;
        rewardRole = _role;

        epochLength =
            _epochLength == 0 ? DEFAULT_EPOCH_LENGTH : _epochLength;
        emit EpochLengthUpdated(epochLength);

        uint256 pct = _rewardPct == 0 ? DEFAULT_REWARD_PCT : _rewardPct;
        require(pct <= 100, "pct");
        rewardPct = pct;
        emit RewardPctUpdated(pct);

        lastEpochTime = block.timestamp;
    }

    /// @notice set the length of each epoch in seconds
    function setEpochLength(uint256 length) external onlyOwner {
        epochLength = length;
        emit EpochLengthUpdated(length);
    }

    /// @notice set the percentage of FeePool balance rewarded each epoch
    function setRewardPct(uint256 pct) external onlyOwner {
        require(pct <= 100, "pct");
        rewardPct = pct;
        emit RewardPctUpdated(pct);
    }

    /// @notice update the token address used for rewards
    /// @param newToken ERC20 token using 6 decimals. Set to zero address to
    /// revert to DEFAULT_TOKEN.
    function setToken(IERC20 newToken) external onlyOwner {
        token =
            address(newToken) == address(0)
                ? IERC20(DEFAULT_TOKEN)
                : newToken;
        emit TokenUpdated(address(token));
    }

    /// @notice record voters for the current epoch and snapshot their stake
    function recordVoters(address[] calldata voters) external onlyOwner {
        uint256 epoch = currentEpoch;
        for (uint256 i; i < voters.length; i++) {
            address v = voters[i];
            if (!recorded[epoch][v]) {
                recorded[epoch][v] = true;
                uint256 stake = stakeManager.stakeOf(v, rewardRole);
                stakeSnapshot[epoch][v] = stake;
                totalStake[epoch] += stake;
                emit VoterRecorded(epoch, v, stake);
            }
        }
    }

    /// @notice finalize the current epoch and pull rewards from the FeePool
    function finalizeEpoch() external onlyOwner {
        require(block.timestamp >= lastEpochTime + epochLength, "early");
        uint256 epoch = currentEpoch;
        uint256 total = totalStake[epoch];
        require(total > 0, "no voters");
        uint256 poolBal = token.balanceOf(address(feePool));
        uint256 rewardAmount = (poolBal * rewardPct) / 100;
        feePool.transferReward(address(this), rewardAmount);
        rewardPerStake[epoch] = (rewardAmount * ACCUMULATOR_SCALE) / total;
        emit EpochFinalized(epoch, rewardAmount);
        currentEpoch = epoch + 1;
        lastEpochTime = block.timestamp;
    }

    /// @notice claim rewards for a given epoch
    function claim(uint256 epoch) external {
        require(recorded[epoch][msg.sender], "not voter");
        require(!claimed[epoch][msg.sender], "claimed");
        claimed[epoch][msg.sender] = true;
        uint256 stake = stakeSnapshot[epoch][msg.sender];
        uint256 amount = (stake * rewardPerStake[epoch]) / ACCUMULATOR_SCALE;
        token.safeTransfer(msg.sender, amount);
        emit RewardClaimed(epoch, msg.sender, amount);
    }

    /// @notice Confirms the contract and owner are perpetually tax neutral.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    receive() external payable {
        revert("GovernanceReward: no ether");
    }

    fallback() external payable {
        revert("GovernanceReward: no ether");
    }
}

