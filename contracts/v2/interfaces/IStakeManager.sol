// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IFeePool} from "./IFeePool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IStakeManager
/// @notice Interface for staking balances, job escrows and slashing logic
interface IStakeManager {
    /// @notice Module version for compatibility checks.
    function version() external view returns (uint256);
    /// @notice participant roles
    enum Role {
        Agent,
        Validator,
        Platform
    }

    event StakeDeposited(address indexed user, Role indexed role, uint256 amount);
    event StakeWithdrawn(address indexed user, Role indexed role, uint256 amount);
    event StakeEscrowLocked(bytes32 indexed jobId, address indexed from, uint256 amount);
    event StakeReleased(bytes32 indexed jobId, address indexed to, uint256 amount);
    event RewardPaid(bytes32 indexed jobId, address indexed to, uint256 amount);
    event TokensBurned(bytes32 indexed jobId, uint256 amount);
    /// @notice Emitted when an employer finalizes a job's funds.
    /// @dev Signals that any subsequent burn events stem from employer action.
    event JobFundsFinalized(bytes32 indexed jobId, address indexed employer);
    /// @notice Emitted when the operator reward pool balance changes.
    event RewardPoolUpdated(uint256 balance);
    event StakeTimeLocked(address indexed user, uint256 amount, uint64 unlockTime);
    event StakeUnlocked(address indexed user, uint256 amount);
    event StakeSlashed(
        address indexed user,
        Role role,
        address indexed employer,
        address indexed treasury,
        uint256 employerShare,
        uint256 treasuryShare,
        uint256 operatorShare,
        uint256 validatorShare,
        uint256 burnShare
    );
    event EscrowPenaltyApplied(
        bytes32 indexed jobId,
        address indexed recipient,
        uint256 amount,
        uint256 employerShare,
        uint256 treasuryShare,
        uint256 operatorShare,
        uint256 validatorShare,
        uint256 burnShare
    );
    /// @notice Emitted when stake is slashed from a participant.
    /// @param agent Address whose stake was reduced.
    /// @param amount Total amount slashed from the agent.
    /// @param validator Address of the validator or recipient that triggered the slash.
    event Slash(address indexed agent, uint256 amount, address indexed validator);

    /// @notice Emitted when a validator receives a reward from slashing.
    /// @param validator Address of the validator being rewarded.
    /// @param amount Amount of tokens transferred to the validator.
    /// @param jobId Optional job identifier associated with the reward.
    event RewardValidator(address indexed validator, uint256 amount, bytes32 indexed jobId);
    event DisputeFeeLocked(address indexed payer, uint256 amount);
    event DisputeFeePaid(address indexed to, uint256 amount);
    event DisputeModuleUpdated(address module);
    event ValidationModuleUpdated(address module);
    event ValidatorLockManagerUpdated(address indexed manager, bool allowed);
    event ValidatorStakeLocked(uint256 indexed jobId, address indexed validator, uint256 amount, uint64 unlockTime);
    event ValidatorStakeUnlocked(uint256 indexed jobId, address indexed validator, uint256 amount);
    event ModulesUpdated(address jobRegistry, address disputeModule);
    event MinStakeUpdated(uint256 minStake);
    event RoleMinimumUpdated(Role indexed role, uint256 minStake);
    event SlashingPercentagesUpdated(uint256 employerSlashPct, uint256 treasurySlashPct);
    event OperatorSlashPctUpdated(uint256 operatorSlashPct);
    event ValidatorSlashRewardPctUpdated(uint256 validatorSlashRewardPct);
    event SlashDistributionUpdated(
        uint256 employerSlashPct,
        uint256 treasurySlashPct,
        uint256 operatorSlashPct,
        uint256 validatorSlashRewardPct
    );
    event SlashPercentsUpdated(
        uint256 employerSlashPct,
        uint256 treasurySlashPct,
        uint256 validatorSlashRewardPct,
        uint256 operatorSlashPct,
        uint256 burnSlashPct
    );
    event OperatorSlashShareAllocated(address indexed user, Role indexed role, uint256 amount);
    event TreasuryUpdated(address indexed treasury);
    event TreasuryAllowlistUpdated(address indexed treasury, bool allowed);
    event MaxStakePerAddressUpdated(uint256 maxStake);
    event MaxAGITypesUpdated(uint256 oldMax, uint256 newMax);
    event AGITypeUpdated(address indexed nft, uint256 payoutPct);
    event AGITypeRemoved(address indexed nft);
    event MaxTotalPayoutPctUpdated(uint256 oldMax, uint256 newMax);
    event ParametersUpdated(
        uint256 minStake,
        uint256 employerSlashPct,
        uint256 treasurySlashPct,
        uint256 operatorSlashPct,
        uint256 validatorSlashRewardPct,
        uint256 burnSlashPct,
        uint256 feePct,
        uint256 burnPct,
        uint256 validatorRewardPct
    );
    event AutoStakeTuningEnabled(bool enabled);
    event AutoStakeConfigUpdated(
        uint256 threshold,
        uint256 upPct,
        uint256 downPct,
        uint256 window,
        uint256 floor,
        uint256 ceil,
        int256 tempThreshold,
        int256 hThreshold,
        uint256 disputeWeight,
        uint256 tempWeight,
        uint256 hamWeight
    );
    event ThermostatUpdated(address indexed thermostat);
    event HamiltonianFeedUpdated(address indexed feed);
    event FeePctUpdated(uint256 pct);
    event BurnPctUpdated(uint256 pct);
    event ValidatorRewardPctUpdated(uint256 pct);
    event FeePoolUpdated(address indexed feePool);

    /// @notice deposit stake for caller for a specific role
    /// @param role participant role receiving credit
    /// @param amount token amount with 18 decimals to deposit
    function depositStake(Role role, uint256 amount) external;

    /// @notice acknowledge the tax policy and deposit stake in one call
    function acknowledgeAndDeposit(Role role, uint256 amount) external;

    /// @notice deposit stake on behalf of a user for a specific role
    function depositStakeFor(address user, Role role, uint256 amount) external;

    /// @notice withdraw available stake for a specific role
    /// @param role participant role of the stake being withdrawn
    /// @param amount token amount with 18 decimals to withdraw
    function withdrawStake(Role role, uint256 amount) external;

    /// @notice acknowledge the tax policy and withdraw stake in one call
    function acknowledgeAndWithdraw(Role role, uint256 amount) external;

    /// @notice view the minimum stake override for a role (0 => fallback to global min)
    function roleMinimumStake(Role role) external view returns (uint256);

    /// @notice update minimum stake overrides for all roles
    function setRoleMinimums(uint256 agent, uint256 validator, uint256 platform) external;

    /// @notice update the minimum stake override for a single role
    function setRoleMinimum(Role role, uint256 amount) external;

    /// @notice lock a portion of a user's stake for a period of time
    /// @param user address whose stake is being locked
    /// @param amount token amount with 18 decimals
    /// @param lockTime seconds until the stake unlocks
    function lockStake(address user, uint256 amount, uint64 lockTime) external;

    /// @notice update the allowlist of addresses permitted to manage validator locks
    function setValidatorLockManager(address manager, bool allowed) external;

    /// @notice lock validator stake for a validation round
    /// @param jobId identifier of the job requesting validation
    /// @param user validator address whose stake is being locked
    /// @param amount token amount with 18 decimals
    /// @param lockTime seconds until the stake unlocks
    function lockValidatorStake(uint256 jobId, address user, uint256 amount, uint64 lockTime) external;

    /// @notice lock job reward from an employer
    function lockReward(bytes32 jobId, address from, uint256 amount) external;

    /// @notice generic escrow lock when job ID is managed externally
    function lock(address from, uint256 amount) external;

    /// @notice release locked job reward to recipient
    /// @param jobId unique job identifier
    /// @param employer employer responsible for burns
    /// @param to recipient of the reward
    /// @param amount base token amount with 18 decimals before bonuses
    function releaseReward(
        bytes32 jobId,
        address employer,
        address to,
        uint256 amount,
        bool applyBoost
    ) external;

    /// @notice refund escrowed funds without fees or burns
    function refundEscrow(bytes32 jobId, address to, uint256 amount) external;

    /// @notice redistribute escrowed funds according to the configured slash distribution
    function redistributeEscrow(bytes32 jobId, address recipient, uint256 amount) external;

    /// @notice redistribute escrowed funds with validator weighting
    function redistributeEscrow(
        bytes32 jobId,
        address recipient,
        uint256 amount,
        address[] calldata validators
    ) external;

    /// @notice release previously locked stake for a user
    function releaseStake(address user, uint256 amount) external;

    /// @notice release stake locked for validation
    function unlockValidatorStake(uint256 jobId, address user, uint256 amount) external;

    /// @notice release funds locked via {lock}
    /// @param employer employer responsible for burns
    /// @param to recipient of the tokens
    /// @param amount base token amount with 18 decimals before bonuses
    function release(address employer, address to, uint256 amount, bool applyBoost) external;

    /// @notice finalize job funds by paying agent and forwarding fees
    function finalizeJobFunds(
        bytes32 jobId,
        address employer,
        address agent,
        uint256 reward,
        uint256 validatorReward,
        uint256 fee,
        IFeePool feePool,
        bool byGovernance
    ) external;

    /// @notice finalize job funds with a precomputed payout percentage
    function finalizeJobFundsWithPct(
        bytes32 jobId,
        address employer,
        address agent,
        uint256 agentPct,
        uint256 reward,
        uint256 validatorReward,
        uint256 fee,
        IFeePool feePool,
        bool byGovernance
    ) external;

    /// @notice fund the operator reward pool
    function fundOperatorRewardPool(uint256 amount) external;

    /// @notice withdraw tokens from the operator reward pool
    function withdrawOperatorRewardPool(address to, uint256 amount) external;

    /// @notice distribute validator rewards among selected validators
    ///         weighted by their NFT multipliers
    function distributeValidatorRewards(bytes32 jobId, uint256 amount) external;

    /// @notice Current burn percentage applied to rewards
    function burnPct() external view returns (uint256);

    /// @notice Validator share of slashed stakes
    function validatorSlashRewardPct() external view returns (uint256);

    /// @notice Cap on total payout percentage across AGI types
    function maxTotalPayoutPct() external view returns (uint256);

    /// @notice ERC20 token used for staking operations
    function token() external view returns (IERC20);

    /// @notice current balance of the operator reward pool
    function operatorRewardPool() external view returns (uint256);

    /// @notice set the dispute module authorized to manage dispute fees
    function setDisputeModule(address module) external;

    /// @notice set the validation module used for validator lookups
    function setValidationModule(address module) external;

    /// @notice update job registry and dispute module in one call
    /// @dev Staking is disabled until `jobRegistry` is configured.
    function setModules(address _jobRegistry, address _disputeModule) external;

    /// @notice lock a dispute fee from the payer
    function lockDisputeFee(address payer, uint256 amount) external;

    /// @notice pay out a locked dispute fee to the recipient
    function payDisputeFee(address to, uint256 amount) external;

    /// @notice slash stake from a user for a specific role
    /// @param user address whose stake will be reduced
    /// @param role participant role of the slashed stake
    /// @param amount token amount with 18 decimals to slash
    /// @param employer recipient of the employer share
    function slash(address user, Role role, uint256 amount, address employer) external;
    function slash(
        address user,
        Role role,
        uint256 amount,
        address employer,
        address[] calldata validators
    ) external;

    /// @notice slash validator stake during dispute resolution
    /// @param user address whose stake will be reduced
    /// @param amount token amount with 18 decimals to slash
    /// @param recipient address receiving the slashed share
    function slash(address user, uint256 amount, address recipient) external;
    function slash(
        address user,
        uint256 amount,
        address recipient,
        address[] calldata validators
    ) external;

    function governanceSlash(
        address user,
        Role role,
        uint256 pctBps,
        address beneficiary
    ) external returns (uint256 amount);

    /// @notice owner configuration helpers
    function setMinStake(uint256 _minStake) external;
    function setSlashPercents(
        uint16 employerSlashPct,
        uint16 treasurySlashPct,
        uint16 validatorSlashPct,
        uint16 operatorSlashPct,
        uint16 burnSlashPct
    ) external;

    function setSlashingPercentages(uint256 _employerSlashPct, uint256 _treasurySlashPct) external;
    function setSlashingParameters(uint256 _employerSlashPct, uint256 _treasurySlashPct) external;
    function setValidatorSlashRewardPct(uint256 _validatorSlashPct) external;
    function setSlashingDistribution(
        uint256 _employerSlashPct,
        uint256 _treasurySlashPct,
        uint256 _validatorSlashPct
    ) external;

    function setOperatorSlashPct(uint256 _operatorSlashPct) external;

    function setSlashDistribution(
        uint256 _employerSlashPct,
        uint256 _treasurySlashPct,
        uint256 _operatorSlashPct,
        uint256 _validatorSlashPct
    ) external;
    function setTreasury(address _treasury) external;
    function setTreasuryAllowlist(address _treasury, bool allowed) external;
    function setMaxStakePerAddress(uint256 maxStake) external;
    function setMaxAGITypes(uint256 newMax) external;
    function setMaxTotalPayoutPct(uint256 newMax) external;
    function addAGIType(address nft, uint256 payoutPct) external;
    function removeAGIType(address nft) external;
    function setFeePct(uint256 pct) external;
    function setFeePool(IFeePool pool) external;
    function setBurnPct(uint256 pct) external;
    function setValidatorRewardPct(uint256 pct) external;
    function autoTuneStakes(bool enabled) external;
    function configureAutoStake(
        uint256 threshold,
        uint256 upPct,
        uint256 downPct,
        uint256 window,
        uint256 floor,
        uint256 ceil,
        int256 tempThreshold,
        int256 hThreshold,
        uint256 disputeWeight,
        uint256 tempWeight,
        uint256 hamWeight
    ) external;
    function setThermostat(address thermostat) external;
    function setHamiltonianFeed(address feed) external;
    function recordDispute() external;
    function checkpointStake() external;

    /// @notice return total stake deposited by a user for a role
    function stakeOf(address user, Role role) external view returns (uint256);

    /// @notice return aggregate stake for a role
    function totalStake(Role role) external view returns (uint256);

    /// @notice return aggregate stake weighted by NFT multipliers for a role
    function totalBoostedStake(Role role) external view returns (uint256);

    /// @notice Recalculate boosted stake for a user when NFT holdings change
    /// @param user address whose boosted stake is being updated
    /// @param role participant role of the stake
    function syncBoostedStake(address user, Role role) external;

    /// @notice address of the JobRegistry authorized to deposit fees
    function jobRegistry() external view returns (address);

    /// @notice Total payout percentage for a participant based on AGI type NFTs
    /// @dev Returns 100 when the user holds no approved NFTs.
    function getTotalPayoutPct(address user) external view returns (uint256);
}
