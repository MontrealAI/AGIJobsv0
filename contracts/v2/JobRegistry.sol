// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {TaxAcknowledgement} from "./libraries/TaxAcknowledgement.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";
import {ICertificateNFT} from "./interfaces/ICertificateNFT.sol";
import {IJobRegistryAck} from "./interfaces/IJobRegistryAck.sol";
import {TOKEN_SCALE} from "./Constants.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title JobRegistry
/// @notice Coordinates job lifecycle and external modules.
/// @dev Tax obligations never accrue to this registry or its owner. All
/// liabilities remain with employers, agents, and validators as expressed by
/// the owner‑controlled `TaxPolicy` reference.
contract JobRegistry is Governable, ReentrancyGuard, TaxAcknowledgement, Pausable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    error JobParametersUnset();
    error RewardOverflow();
    error RewardTooHigh();
    error InvalidDeadline();
    error InvalidAgentTypes();
    error InvalidSpecHash();
    error DurationTooLong();
    error InvalidPercentages();
    error BlacklistedEmployer();
    error CannotExpire();
    error DeadlineNotReached();
    error InvalidPercentage();
    error InvalidValidationModule();
    error InvalidStakeManager();
    error InvalidReputationModule();
    error InvalidDisputeModule();
    error InvalidCertificateNFT();
    error PolicyNotTaxExempt();
    error InvalidFeePool();
    error InvalidIdentityRegistry();
    error IdentityRegistryNotSet();
    error InvalidTaxPolicy();
    error InvalidTreasury();
    error InvalidAckModule();
    error NotGovernanceOrPauser();
    error NotAcknowledger();
    error ZeroAcknowledgerAddress();
    error StakeOverflow();
    error NotOpen();
    error BlacklistedAgent();
    error NotAuthorizedAgent();
    error AgentTypeNotAllowed();
    error InvalidJobState();
    error OnlyAgent();
    error DeadlinePassed();
    error OnlyValidationModule();
    error NotSubmitted();
    error EvidenceMissing();
    error OnlyParticipant();
    error CannotDispute();
    error Blacklisted();
    error OnlyDisputeModule();
    error NoDispute();
    error NotReady();
    error CannotCancel();
    error OnlyEmployer();
    error BurnReceiptMissing();
    error BurnNotConfirmed();
    error BurnAmountTooLow();
    error InsufficientAgentStake(uint256 required, uint256 actual);
    error MaxActiveJobsReached(uint256 limit);

    enum State {
        None,
        Created,
        Applied,
        Submitted,
        Completed,
        Disputed,
        Finalized,
        Cancelled
    }

    struct Job {
        address employer;
        address agent;
        uint128 reward;
        uint96 stake;
        uint128 burnReceiptAmount;
        bytes32 uriHash;
        bytes32 resultHash;
        bytes32 specHash;
        uint256 packedMetadata;
    }

    struct JobMetadata {
        State state;
        bool success;
        bool burnConfirmed;
        uint8 agentTypes;
        uint32 feePct;
        uint32 agentPct;
        uint64 deadline;
        uint64 assignedAt;
    }

    uint256 private constant _STATE_OFFSET = 0;
    uint256 private constant _SUCCESS_OFFSET = 3;
    uint256 private constant _BURN_CONFIRMED_OFFSET = 4;
    uint256 private constant _AGENT_TYPES_OFFSET = 5;
    uint256 private constant _FEE_PCT_OFFSET = 13;
    uint256 private constant _AGENT_PCT_OFFSET = 45;
    uint256 private constant _DEADLINE_OFFSET = 77;
    uint256 private constant _ASSIGNED_AT_OFFSET = 141;

    uint256 private constant _STATE_MASK = 0x7 << _STATE_OFFSET;
    uint256 private constant _SUCCESS_MASK = 1 << _SUCCESS_OFFSET;
    uint256 private constant _BURN_CONFIRMED_MASK = 1 << _BURN_CONFIRMED_OFFSET;
    uint256 private constant _AGENT_TYPES_MASK = uint256(0xFF) << _AGENT_TYPES_OFFSET;
    uint256 private constant _FEE_PCT_MASK = uint256(type(uint32).max) << _FEE_PCT_OFFSET;
    uint256 private constant _AGENT_PCT_MASK = uint256(type(uint32).max) << _AGENT_PCT_OFFSET;
    uint256 private constant _DEADLINE_MASK = uint256(type(uint64).max) << _DEADLINE_OFFSET;
    uint256 private constant _ASSIGNED_AT_MASK = uint256(type(uint64).max) << _ASSIGNED_AT_OFFSET;

    function _encodeMetadata(JobMetadata memory metadata)
        private
        pure
        returns (uint256 packed)
    {
        packed =
            (uint256(uint8(metadata.state)) << _STATE_OFFSET) |
            (metadata.success ? (1 << _SUCCESS_OFFSET) : 0) |
            (metadata.burnConfirmed ? (1 << _BURN_CONFIRMED_OFFSET) : 0) |
            (uint256(metadata.agentTypes) << _AGENT_TYPES_OFFSET) |
            (uint256(metadata.feePct) << _FEE_PCT_OFFSET) |
            (uint256(metadata.agentPct) << _AGENT_PCT_OFFSET) |
            (uint256(metadata.deadline) << _DEADLINE_OFFSET) |
            (uint256(metadata.assignedAt) << _ASSIGNED_AT_OFFSET);
    }

    function _decodeMetadata(uint256 packed)
        private
        pure
        returns (JobMetadata memory metadata)
    {
        metadata.state = State(uint8((packed & _STATE_MASK) >> _STATE_OFFSET));
        metadata.success = (packed & _SUCCESS_MASK) != 0;
        metadata.burnConfirmed = (packed & _BURN_CONFIRMED_MASK) != 0;
        metadata.agentTypes = uint8((packed & _AGENT_TYPES_MASK) >> _AGENT_TYPES_OFFSET);
        metadata.feePct = uint32((packed & _FEE_PCT_MASK) >> _FEE_PCT_OFFSET);
        metadata.agentPct = uint32((packed & _AGENT_PCT_MASK) >> _AGENT_PCT_OFFSET);
        metadata.deadline = uint64((packed & _DEADLINE_MASK) >> _DEADLINE_OFFSET);
        metadata.assignedAt = uint64((packed & _ASSIGNED_AT_MASK) >> _ASSIGNED_AT_OFFSET);
    }

    function _getState(Job storage job) private view returns (State) {
        return State(uint8((job.packedMetadata & _STATE_MASK) >> _STATE_OFFSET));
    }

    function _setState(Job storage job, State state) private {
        job.packedMetadata =
            (job.packedMetadata & ~_STATE_MASK) |
            (uint256(uint8(state)) << _STATE_OFFSET);
    }

    function _getSuccess(Job storage job) private view returns (bool) {
        return (job.packedMetadata & _SUCCESS_MASK) != 0;
    }

    function _setSuccess(Job storage job, bool success) private {
        if (success) {
            job.packedMetadata = job.packedMetadata | _SUCCESS_MASK;
        } else {
            job.packedMetadata = job.packedMetadata & ~_SUCCESS_MASK;
        }
    }

    function _getBurnConfirmed(Job storage job) private view returns (bool) {
        return (job.packedMetadata & _BURN_CONFIRMED_MASK) != 0;
    }

    function _setBurnConfirmed(Job storage job, bool burnConfirmed) private {
        if (burnConfirmed) {
            job.packedMetadata = job.packedMetadata | _BURN_CONFIRMED_MASK;
        } else {
            job.packedMetadata = job.packedMetadata & ~_BURN_CONFIRMED_MASK;
        }
    }

    function _getAgentTypes(Job storage job) private view returns (uint8) {
        return uint8((job.packedMetadata & _AGENT_TYPES_MASK) >> _AGENT_TYPES_OFFSET);
    }

    function _getFeePct(Job storage job) private view returns (uint32) {
        return uint32((job.packedMetadata & _FEE_PCT_MASK) >> _FEE_PCT_OFFSET);
    }

    function _getAgentPct(Job storage job) private view returns (uint32) {
        return uint32((job.packedMetadata & _AGENT_PCT_MASK) >> _AGENT_PCT_OFFSET);
    }

    function _setAgentPct(Job storage job, uint32 pct) private {
        job.packedMetadata =
            (job.packedMetadata & ~_AGENT_PCT_MASK) |
            (uint256(pct) << _AGENT_PCT_OFFSET);
    }

    function _getDeadline(Job storage job) private view returns (uint64) {
        return uint64((job.packedMetadata & _DEADLINE_MASK) >> _DEADLINE_OFFSET);
    }

    function _getAssignedAt(Job storage job) private view returns (uint64) {
        return uint64((job.packedMetadata & _ASSIGNED_AT_MASK) >> _ASSIGNED_AT_OFFSET);
    }

    function _setAssignedAt(Job storage job, uint64 timestamp) private {
        job.packedMetadata =
            (job.packedMetadata & ~_ASSIGNED_AT_MASK) |
            (uint256(timestamp) << _ASSIGNED_AT_OFFSET);
    }

    function decodeJobMetadata(uint256 packed)
        external
        pure
        returns (JobMetadata memory)
    {
        return _decodeMetadata(packed);
    }

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    struct BurnReceipt {
        uint256 amount;
        uint256 blockNumber;
        bool exists;
    }

    mapping(uint256 => mapping(bytes32 => BurnReceipt)) private burnReceipts;
    mapping(uint256 => uint256) public pendingValidationEntropy;
    mapping(uint256 => bool) public validationStartPending;
    mapping(uint256 => address[]) private jobValidators;
    mapping(uint256 => mapping(address => bool)) private jobValidatorVotes;
    mapping(uint256 => bool) public reputationProcessed;

    /// @notice Tracks job outcomes for each employer.
    struct EmployerStats {
        /// @notice Number of successfully finalised jobs.
        uint256 successful;
        /// @notice Number of jobs that ended in dispute or failure.
        uint256 failed;
    }

    mapping(address => EmployerStats) public employerStats;

    /// @notice Tracks the number of active jobs assigned to each agent.
    mapping(address => uint256) public activeJobs;
    /// @notice Optional governance-configured limit on active jobs per agent. Zero disables the limit.
    uint256 public maxActiveJobsPerAgent;

    function getJobValidators(uint256 jobId)
        external
        view
        returns (address[] memory)
    {
        return jobValidators[jobId];
    }

    function getJobValidatorVote(uint256 jobId, address validator)
        external
        view
        returns (bool)
    {
        return jobValidatorVotes[jobId][validator];
    }

    function getSpecHash(uint256 jobId) external view returns (bytes32) {
        return jobs[jobId].specHash;
    }

    function burnEvidenceStatus(uint256 jobId)
        public
        view
        returns (bool burnRequired, bool burnSatisfied)
    {
        burnRequired = _isBurnRequired();
        if (!burnRequired) {
            return (false, true);
        }
        Job storage job = jobs[jobId];
        burnSatisfied = _getBurnConfirmed(job);
    }

    function _isBurnRequired() internal view returns (bool) {
        IStakeManager manager = stakeManager;
        return address(manager) != address(0) && manager.burnPct() > 0;
    }

    function _clearValidatorData(uint256 jobId) internal {
        address[] storage validators = jobValidators[jobId];
        uint256 length = validators.length;
        if (length == 0) {
            return;
        }
        for (uint256 i; i < length;) {
            delete jobValidatorVotes[jobId][validators[i]];
            unchecked {
                ++i;
            }
        }
        delete jobValidators[jobId];
    }

    function _clearValidationStart(uint256 jobId) internal {
        if (validationStartPending[jobId]) {
            validationStartPending[jobId] = false;
            delete pendingValidationEntropy[jobId];
        }
    }

    function _startValidation(uint256 jobId, uint256 entropy) internal {
        validationStartPending[jobId] = false;
        delete pendingValidationEntropy[jobId];
        if (address(validationModule) != address(0)) {
            validationModule.start(jobId, entropy);
            emit ValidationStartTriggered(jobId);
        }
    }

    /// @notice Records evidence of a token burn by the employer.
    /// @dev Employers must acknowledge the active tax policy before calling.
    function submitBurnReceipt(
        uint256 jobId,
        bytes32 burnTxHash,
        uint256 amount,
        uint256 blockNumber
    )
        external
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        Job storage job = jobs[jobId];
        if (job.employer != msg.sender) revert OnlyEmployer();
        burnReceipts[jobId][burnTxHash] = BurnReceipt({
            amount: amount,
            blockNumber: blockNumber,
            exists: true
        });
        emit BurnReceiptSubmitted(jobId, burnTxHash, amount, blockNumber);
    }

    function hasBurnReceipt(uint256 jobId, bytes32 burnTxHash)
        external
        view
        returns (bool)
    {
        return burnReceipts[jobId][burnTxHash].exists;
    }

    /// @notice Retrieve raw reputation statistics for an employer.
    /// @param employer Address of the employer to query.
    /// @return successful Count of successfully finalised jobs.
    /// @return failed Count of jobs that failed or were disputed.
    function getEmployerReputation(address employer)
        external
        view
        returns (uint256 successful, uint256 failed)
    {
        EmployerStats storage stats = employerStats[employer];
        return (stats.successful, stats.failed);
    }

    /// @notice Compute a normalized employer reputation score.
    /// @dev Returns the ratio of positive to total outcomes scaled by 1e18.
    /// A score of 1e18 represents a perfect record, while 0 indicates only
    /// negative outcomes. If an employer has no history, the score is 0.
    /// @param employer Address of the employer to query.
    /// @return score Reputation score in 18-decimal fixed point.
    function getEmployerScore(address employer) external view returns (uint256 score) {
        EmployerStats storage stats = employerStats[employer];
        uint256 total = stats.successful + stats.failed;
        if (total == 0) {
            return 0;
        }
        return (stats.successful * TOKEN_SCALE) / total;
    }

    /// @notice Confirms previously submitted burn evidence.
    /// @dev Employers must acknowledge the active tax policy before calling.
    function confirmEmployerBurn(uint256 jobId, bytes32 burnTxHash)
        external
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        Job storage job = jobs[jobId];
        if (job.employer != msg.sender) revert OnlyEmployer();
        if (!burnReceipts[jobId][burnTxHash].exists) revert BurnReceiptMissing();
        _setBurnConfirmed(job, true);
        job.burnReceiptAmount = uint128(burnReceipts[jobId][burnTxHash].amount);
        emit BurnConfirmed(jobId, burnTxHash);
        if (validationStartPending[jobId] && _getState(job) == State.Submitted) {
            _startValidation(jobId, pendingValidationEntropy[jobId]);
        }
    }

    IValidationModule public validationModule;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IDisputeModule public disputeModule;
    ICertificateNFT public certificateNFT;
    ITaxPolicy public taxPolicy;
    IFeePool public feePool;
    IIdentityRegistry public identityRegistry;
    address public treasury;
    address public pauser;


    /// @notice Addresses allowed to acknowledge the tax policy for others.
    /// @dev Each acknowledger must be a valid contract or externally owned account.
    mapping(address => bool) public acknowledgers;

    modifier onlyGovernanceOrPauser() {
        if (msg.sender != address(governance) && msg.sender != pauser) {
            revert NotGovernanceOrPauser();
        }
        _;
    }

    function setPauser(address _pauser) external onlyGovernance {
        pauser = _pauser;
        emit PauserUpdated(_pauser);
    }

    // cache successful agent authorizations
    mapping(address => bool) public agentAuthCache;
    mapping(address => uint256) public agentAuthExpiry;
    mapping(address => uint256) public agentAuthVersion;
    uint256 public agentAuthCacheVersion;
    uint256 public agentAuthCacheDuration = 1 days;

    /// @dev Reusable gate enforcing acknowledgement of the latest tax policy
    /// version for callers other than the owner, dispute module, or validation module.

    modifier onlyAfterDeadline(uint256 jobId) {
        Job storage job = jobs[jobId];
        if (_getState(job) != State.Applied) revert CannotExpire();
        uint64 deadline = _getDeadline(job);
        if (
            block.timestamp <=
            uint256(deadline) + expirationGracePeriod
        ) revert DeadlineNotReached();
        _;
    }

    // default agent stake requirement configured by owner
    uint96 public jobStake;
    uint96 public minAgentStake;
    uint96 public constant DEFAULT_JOB_STAKE = uint96(TOKEN_SCALE);
    uint256 public feePct;
    uint256 public constant DEFAULT_FEE_PCT = 5;
    uint256 public maxJobReward;
    uint256 public maxJobDuration;
    uint256 public validatorRewardPct;
    uint256 public constant DEFAULT_VALIDATOR_REWARD_PCT = 8;
    uint256 public expirationGracePeriod;

    // module configuration events
    event ModuleUpdated(string module, address indexed newAddress);
    event ValidationModuleUpdated(address module);
    event StakeManagerUpdated(address manager);
    event ReputationEngineUpdated(address engine);
    event DisputeModuleUpdated(address module);
    event CertificateNFTUpdated(address nft);
    event IdentityRegistryUpdated(address identityRegistry);
    event ValidatorRewardPctUpdated(uint256 pct);
    event PauserUpdated(address indexed pauser);
    /// @notice Emitted when the tax policy reference or version changes.
    /// @param policy Address of the TaxPolicy contract.
    /// @param version Incrementing version participants must acknowledge.
    event TaxPolicyUpdated(address policy, uint256 version);
    /// @notice Emitted when a participant acknowledges the tax policy, placing
    /// full tax responsibility on the caller while the contract owner remains
    /// exempt. The acknowledgement text is included in the event so explorers
    /// like Etherscan can surface the exact disclaimer the participant
    /// accepted.
    /// @param user Address of the acknowledging participant.
    /// @param version Tax policy version that was acknowledged.
    /// @param acknowledgement Human‑readable disclaimer confirming the caller
    ///        bears all tax liability.
    event TaxAcknowledged(
        address indexed user,
        uint256 version,
        string acknowledgement
    );

    /// @notice Emitted when an acknowledger role is updated.
    /// @param acknowledger Address being granted or revoked the role.
    /// @param allowed True if the address can acknowledge for others.
    event AcknowledgerUpdated(address indexed acknowledger, bool allowed);

    event AgentRootNodeUpdated(bytes32 node);
    event AgentMerkleRootUpdated(bytes32 root);
    event ValidatorRootNodeUpdated(bytes32 node);
    event ReputationProcessingMarked(uint256 indexed jobId);
    event ValidatorMerkleRootUpdated(bytes32 root);
    event AgentAuthCacheUpdated(address indexed agent, bool authorized);
    event AgentAuthCacheDurationUpdated(uint256 duration);
    event AgentAuthCacheVersionBumped(uint256 version);
    /// @notice Emitted when an agent's ENS identity is verified during a job action.
    event AgentIdentityVerified(
        address indexed agent,
        bytes32 indexed node,
        string label,
        bool viaWrapper,
        bool viaMerkle
    );

    // job parameter template event
    event JobParametersUpdated(
        uint256 reward,
        uint256 stake,
        uint256 maxJobReward,
        uint256 maxJobDuration,
        uint256 minAgentStake
    );

    // job lifecycle events
    event JobFunded(
        uint256 indexed jobId,
        address indexed employer,
        uint256 reward,
        uint256 fee
    );
    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake,
        uint256 fee,
        bytes32 specHash,
        string uri
    );
    /// @notice Emitted when an agent submits an application for a job.
    event ApplicationSubmitted(
        uint256 indexed jobId,
        address indexed applicant,
        string subdomain
    );
    /// @notice Emitted when an agent becomes the active assignee for a job.
    event AgentAssigned(
        uint256 indexed jobId,
        address indexed agent,
        string subdomain
    );
    /// @notice Emitted when work has been submitted for validation.
    event ResultSubmitted(
        uint256 indexed jobId,
        address indexed worker,
        bytes32 resultHash,
        string resultURI,
        string subdomain
    );
    /// @dev Legacy alias for {AgentAssigned}. Kept for backwards compatibility.
    event JobApplied(
        uint256 indexed jobId,
        address indexed agent,
        string subdomain
    );
    /// @dev Legacy alias for {ResultSubmitted}. Kept for backwards compatibility.
    event JobSubmitted(
        uint256 indexed jobId,
        address indexed worker,
        bytes32 resultHash,
        string resultURI,
        string subdomain
    );
    event JobCompleted(uint256 indexed jobId, bool success);
    /// @notice Emitted when job funds are disbursed
    /// @param jobId Identifier of the job
    /// @param worker Agent who performed the job
    /// @param base Amount paid from the job's escrow
    /// @param bonus Additional amount paid from the reward pool
    /// @param fee Protocol fee routed to the FeePool
    event JobPayout(
        uint256 indexed jobId,
        address indexed worker,
        uint256 base,
        uint256 bonus,
        uint256 fee
    );
    /// @notice Emitted when a job is finalized
    /// @param jobId Identifier of the job
    /// @param worker Agent who performed the job
    event JobFinalized(uint256 indexed jobId, address indexed worker);
    event JobCancelled(uint256 indexed jobId);
    event BurnReceiptSubmitted(
        uint256 indexed jobId,
        bytes32 indexed burnTxHash,
        uint256 amount,
        uint256 blockNumber
    );
    event BurnConfirmed(uint256 indexed jobId, bytes32 indexed burnTxHash);
    event BurnDiscrepancy(
        uint256 indexed jobId,
        uint256 receiptAmount,
        uint256 expectedAmount
    );
    event ValidationStartPending(uint256 indexed jobId);
    event ValidationStartTriggered(uint256 indexed jobId);
    /// @notice Emitted when an assigned job is cancelled after missing its deadline
    /// @param jobId Identifier of the expired job
    /// @param caller Address that triggered the expiration
    event JobExpired(uint256 indexed jobId, address indexed caller);
    event JobTimedOut(uint256 indexed jobId, address indexed caller);
    event JobDisputed(uint256 indexed jobId, address indexed caller);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event FeePoolUpdated(address pool);
    event FeePctUpdated(uint256 feePct);
    event ExpirationGracePeriodUpdated(uint256 period);
    event MaxActiveJobsPerAgentUpdated(uint256 limit);
    event GovernanceFinalized(
        uint256 indexed jobId,
        address indexed caller,
        bool fundsRedirected
    );
    event TreasuryUpdated(address treasury);

    constructor(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certNFT,
        IFeePool _feePool,
        ITaxPolicy _policy,
        uint256 _feePct,
        uint96 _jobStake,
        address[] memory _ackModules,
        address _timelock // timelock or multisig controller
    ) Governable(_timelock) {
        uint256 pct = _feePct == 0 ? DEFAULT_FEE_PCT : _feePct;
        if (pct > 100) revert InvalidPercentage();
        feePct = pct;
        jobStake = _jobStake == 0 ? DEFAULT_JOB_STAKE : _jobStake;
        validatorRewardPct = DEFAULT_VALIDATOR_REWARD_PCT;
        emit ValidatorRewardPctUpdated(validatorRewardPct);
        if (address(_validation) != address(0)) {
            if (_validation.version() != 2) revert InvalidValidationModule();
            validationModule = _validation;
            emit ValidationModuleUpdated(address(_validation));
            emit ModuleUpdated("ValidationModule", address(_validation));
        }
        if (address(_stakeMgr) != address(0)) {
            if (_stakeMgr.version() != 2) revert InvalidStakeManager();
            stakeManager = _stakeMgr;
            emit StakeManagerUpdated(address(_stakeMgr));
            emit ModuleUpdated("StakeManager", address(_stakeMgr));
        }
        if (address(_reputation) != address(0)) {
            if (_reputation.version() != 2) revert InvalidReputationModule();
            reputationEngine = _reputation;
            emit ReputationEngineUpdated(address(_reputation));
            emit ModuleUpdated("ReputationEngine", address(_reputation));
        }
        if (address(_dispute) != address(0)) {
            if (_dispute.version() != 2) revert InvalidDisputeModule();
            disputeModule = _dispute;
            emit DisputeModuleUpdated(address(_dispute));
            emit ModuleUpdated("DisputeModule", address(_dispute));
        }
        if (address(_certNFT) != address(0)) {
            if (_certNFT.version() != 2) revert InvalidCertificateNFT();
            certificateNFT = _certNFT;
            emit CertificateNFTUpdated(address(_certNFT));
            emit ModuleUpdated("CertificateNFT", address(_certNFT));
        }
        if (address(_feePool) != address(0)) {
            feePool = _feePool;
            emit FeePoolUpdated(address(_feePool));
            emit ModuleUpdated("FeePool", address(_feePool));
        }
        emit FeePctUpdated(feePct);
        if (address(_policy) != address(0)) {
            if (!_policy.isTaxExempt()) revert PolicyNotTaxExempt();
            taxPolicy = _policy;
            emit TaxPolicyUpdated(address(_policy), _policy.policyVersion());
        }
        for (uint256 i; i < _ackModules.length;) {
            acknowledgers[_ackModules[i]] = true;
            emit AcknowledgerUpdated(_ackModules[i], true);
            unchecked {
                ++i;
            }
        }
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------
    // Setters below are executed manually via Etherscan's "Write Contract"
    // tab using the authorized owner account.
    function setModules(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certNFT,
        IFeePool _feePool,
        address[] calldata _ackModules
    ) external onlyGovernance {
        if (address(_validation) == address(0)) revert InvalidValidationModule();
        if (address(_stakeMgr) == address(0)) revert InvalidStakeManager();
        if (address(_reputation) == address(0)) revert InvalidReputationModule();
        if (address(_dispute) == address(0)) revert InvalidDisputeModule();
        if (address(_certNFT) == address(0)) revert InvalidCertificateNFT();

        if (_validation.version() != 2) revert InvalidValidationModule();
        if (_stakeMgr.version() != 2) revert InvalidStakeManager();
        if (_reputation.version() != 2) revert InvalidReputationModule();
        if (_dispute.version() != 2) revert InvalidDisputeModule();
        if (_certNFT.version() != 2) revert InvalidCertificateNFT();
        if (address(_feePool) == address(0) || _feePool.version() != 2)
            revert InvalidFeePool();

        validationModule = _validation;
        stakeManager = _stakeMgr;
        acknowledgers[address(_stakeMgr)] = true;
        emit AcknowledgerUpdated(address(_stakeMgr), true);
        reputationEngine = _reputation;
        disputeModule = _dispute;
        certificateNFT = _certNFT;
        feePool = _feePool;
        emit ValidationModuleUpdated(address(_validation));
        emit ModuleUpdated("ValidationModule", address(_validation));
        emit StakeManagerUpdated(address(_stakeMgr));
        emit ModuleUpdated("StakeManager", address(_stakeMgr));
        emit ReputationEngineUpdated(address(_reputation));
        emit ModuleUpdated("ReputationEngine", address(_reputation));
        emit DisputeModuleUpdated(address(_dispute));
        emit ModuleUpdated("DisputeModule", address(_dispute));
        emit CertificateNFTUpdated(address(_certNFT));
        emit ModuleUpdated("CertificateNFT", address(_certNFT));
        emit FeePoolUpdated(address(_feePool));
        emit ModuleUpdated("FeePool", address(_feePool));
        for (uint256 i; i < _ackModules.length;) {
            (bool ok, bytes memory data) = _ackModules[i].staticcall(
                abi.encodeWithSelector(
                    IJobRegistryAck.acknowledgeFor.selector,
                    address(0)
                )
            );
            if (!ok || data.length < 64) revert InvalidAckModule();
            acknowledgers[_ackModules[i]] = true;
            emit AcknowledgerUpdated(_ackModules[i], true);
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Update the identity registry used for agent verification.
    /// @param registry Address of the IdentityRegistry contract.
    function setIdentityRegistry(IIdentityRegistry registry) external onlyGovernance {
        if (address(registry) == address(0)) revert InvalidIdentityRegistry();
        if (registry.version() != 2) revert InvalidIdentityRegistry();
        identityRegistry = registry;
        bumpAgentAuthCacheVersion();
        if (address(validationModule) != address(0)) {
            try validationModule.bumpValidatorAuthCacheVersion() {} catch {}
        }
        emit IdentityRegistryUpdated(address(registry));
        emit ModuleUpdated("IdentityRegistry", address(registry));
    }

    /// @notice Switch the active dispute module.
    /// @param module Address of the new dispute module contract.
    function setDisputeModule(IDisputeModule module) external onlyGovernance {
        if (address(module) == address(0)) revert InvalidDisputeModule();
        if (module.version() != 2) revert InvalidDisputeModule();
        disputeModule = module;
        emit DisputeModuleUpdated(address(module));
        emit ModuleUpdated("DisputeModule", address(module));
    }

    /// @notice Update the ENS root node used for agent verification.
    /// @param node Namehash of the agent parent node (e.g. `agent.agi.eth`).
    function setAgentRootNode(bytes32 node) external onlyGovernance {
        if (address(identityRegistry) == address(0)) revert IdentityRegistryNotSet();
        identityRegistry.setAgentRootNode(node);
        bumpAgentAuthCacheVersion();
        emit AgentRootNodeUpdated(node);
    }

    /// @notice Update the Merkle root for the agent allowlist.
    /// @param root Merkle root of approved agent addresses.
    function setAgentMerkleRoot(bytes32 root) external onlyGovernance {
        if (address(identityRegistry) == address(0)) revert IdentityRegistryNotSet();
        identityRegistry.setAgentMerkleRoot(root);
        bumpAgentAuthCacheVersion();
        emit AgentMerkleRootUpdated(root);
    }

    /// @notice Increment the agent authorization cache version, invalidating all
    /// existing cached authorizations.
    function bumpAgentAuthCacheVersion() public onlyGovernance {
        unchecked {
            ++agentAuthCacheVersion;
        }
        emit AgentAuthCacheVersionBumped(agentAuthCacheVersion);
    }

    /// @notice Update the ENS root node used for validator verification.
    /// @param node Namehash of the validator parent node (e.g. `club.agi.eth`).
    function setValidatorRootNode(bytes32 node) external onlyGovernance {
        if (address(identityRegistry) == address(0)) revert IdentityRegistryNotSet();
        if (address(validationModule) == address(0)) revert InvalidValidationModule();
        identityRegistry.setClubRootNode(node);
        validationModule.bumpValidatorAuthCacheVersion();
        emit ValidatorRootNodeUpdated(node);
    }

    /// @notice Update the Merkle root for the validator allowlist.
    /// @param root Merkle root of approved validator addresses.
    function setValidatorMerkleRoot(bytes32 root) external onlyGovernance {
        if (address(identityRegistry) == address(0)) revert IdentityRegistryNotSet();
        if (address(validationModule) == address(0)) revert InvalidValidationModule();
        identityRegistry.setValidatorMerkleRoot(root);
        validationModule.bumpValidatorAuthCacheVersion();
        emit ValidatorMerkleRootUpdated(root);
    }

    /// @notice Refresh or invalidate cached agent authorization entries.
    /// @param agent Address of the agent being updated.
    /// @param authorized True to refresh the cache entry, false to invalidate it.
    function updateAgentAuthCache(address agent, bool authorized)
        external
        onlyGovernance
    {
        agentAuthCache[agent] = authorized;
        agentAuthExpiry[agent] =
            authorized ? block.timestamp + agentAuthCacheDuration : 0;
        agentAuthVersion[agent] = authorized ? agentAuthCacheVersion : 0;
        emit AgentAuthCacheUpdated(agent, authorized);
    }

    /// @notice Update the duration for cached agent authorizations.
    /// @param duration Seconds an authorization remains valid in cache.
    function setAgentAuthCacheDuration(uint256 duration) external onlyGovernance {
        agentAuthCacheDuration = duration;
        emit AgentAuthCacheDurationUpdated(duration);
    }

    /// @notice update the FeePool contract used for revenue sharing
    function setFeePool(IFeePool _feePool) external onlyGovernance {
        if (address(_feePool) == address(0) || _feePool.version() != 2)
            revert InvalidFeePool();
        feePool = _feePool;
        emit FeePoolUpdated(address(_feePool));
        emit ModuleUpdated("FeePool", address(_feePool));
    }

    /// @notice update the treasury address used for blacklisted payouts
    /// @dev Treasury must be zero (burn) or a non-owner address
    function setTreasury(address _treasury) external onlyGovernance {
        if (_treasury != address(0) && _treasury == owner()) revert InvalidTreasury();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice update the required agent stake for each job
    function setJobStake(uint96 stake) external onlyGovernance {
        jobStake = stake;
        emit JobParametersUpdated(0, stake, maxJobReward, maxJobDuration, minAgentStake);
    }

    /// @notice update the minimum global stake required for agents when applying
    function setMinAgentStake(uint256 stake) external onlyGovernance {
        if (stake > type(uint96).max) revert StakeOverflow();
        minAgentStake = uint96(stake);
        emit JobParametersUpdated(0, jobStake, maxJobReward, maxJobDuration, stake);
    }

    /// @notice update the percentage of each job reward taken as a protocol fee
    function setFeePct(uint256 _feePct) external onlyGovernance {
        if (_feePct > 100) revert InvalidPercentage();
        if (_feePct + validatorRewardPct > 100) revert InvalidPercentage();
        feePct = _feePct;
        emit FeePctUpdated(_feePct);
    }

    /// @notice update validator reward percentage of job reward
    function setValidatorRewardPct(uint256 pct) external onlyGovernance {
        if (pct > 100) revert InvalidPercentage();
        if (feePct + pct > 100) revert InvalidPercentage();
        validatorRewardPct = pct;
        emit ValidatorRewardPctUpdated(pct);
    }

    /// @notice set the maximum allowed job reward
    function setMaxJobReward(uint256 maxReward) external onlyGovernance {
        maxJobReward = maxReward;
        emit JobParametersUpdated(0, jobStake, maxReward, maxJobDuration, minAgentStake);
    }

    /// @notice set the maximum allowed job duration in seconds
    function setJobDurationLimit(uint256 limit) external onlyGovernance {
        maxJobDuration = limit;
        emit JobParametersUpdated(0, jobStake, maxJobReward, limit, minAgentStake);
    }

    /// @notice Set the maximum number of simultaneously active jobs an agent may hold.
    /// @dev A value of zero disables the limit.
    function setMaxActiveJobsPerAgent(uint256 limit) external onlyGovernance {
        maxActiveJobsPerAgent = limit;
        emit MaxActiveJobsPerAgentUpdated(limit);
    }

    /// @notice set additional grace period after a job's deadline before it can expire
    function setExpirationGracePeriod(uint256 period) external onlyGovernance {
        expirationGracePeriod = period;
        emit ExpirationGracePeriodUpdated(period);
    }

    /// @notice Sets the TaxPolicy contract holding the canonical disclaimer.
    /// @dev Only callable by the owner; the policy address cannot be zero and
    /// must explicitly report tax exemption.
    function setTaxPolicy(ITaxPolicy _policy) external onlyGovernance {
        if (address(_policy) == address(0)) revert InvalidTaxPolicy();
        if (!_policy.isTaxExempt()) revert PolicyNotTaxExempt();
        taxPolicy = _policy;
        emit TaxPolicyUpdated(address(_policy), _policy.policyVersion());
        emit ModuleUpdated("TaxPolicy", address(_policy));
    }

    /// @notice Pause job lifecycle interactions
    function pause() external onlyGovernanceOrPauser {
        _pause();
    }

    /// @notice Resume job lifecycle interactions
    function unpause() external onlyGovernanceOrPauser {
        _unpause();
    }

    /// @notice Confirms this registry and its owner are perpetually tax‑exempt.
    /// @return Always true; no tax liability can accrue here.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @notice Returns the on-chain acknowledgement string stating that all
    /// taxes are the responsibility of employers, agents, and validators.
    function taxAcknowledgement() external view returns (string memory) {
        if (address(taxPolicy) == address(0)) return "";
        return taxPolicy.acknowledgement();
    }

    /// @notice Returns the URI pointing to the full off-chain tax policy.
    function taxPolicyURI() external view returns (string memory) {
        if (address(taxPolicy) == address(0)) return "";
        return taxPolicy.policyURI();
    }

    /// @notice Convenience helper returning both acknowledgement and URI.
    /// @return ack Plain-text disclaimer confirming tax responsibilities.
    /// @return uri Off-chain document location (e.g., IPFS hash).
    function taxPolicyDetails()
        external
        view
        returns (string memory ack, string memory uri)
    {
        if (address(taxPolicy) == address(0)) return ("", "");
        (ack, uri) = taxPolicy.policyDetails();
    }

    /// @notice Allow or revoke an acknowledger address.
    /// @dev When `allowed` is true, `acknowledger` must be a non-zero address representing a valid contract or EOA.
    /// @param acknowledger Address granted permission to acknowledge for users.
    /// @param allowed True to allow the address, false to revoke.
    function setAcknowledger(address acknowledger, bool allowed) external onlyGovernance {
        if (allowed && acknowledger == address(0)) revert ZeroAcknowledgerAddress();
        acknowledgers[acknowledger] = allowed;
        emit AcknowledgerUpdated(acknowledger, allowed);
    }

    /// @notice Internal helper to acknowledge the current tax policy for a user.
    /// @param user Address being marked as having acknowledged the policy.
    function _acknowledge(address user) internal returns (string memory ack) {
        if (address(taxPolicy) == address(0)) revert InvalidTaxPolicy();
        ack = taxPolicy.acknowledgeFor(user);
        emit TaxAcknowledged(user, taxPolicy.policyVersion(), ack);
    }

    /// @notice Acknowledge the current tax policy.
    /// @dev Retrieves the acknowledgement text from the `TaxPolicy` contract
    /// and emits it for off-chain visibility so participants have an on-chain
    /// record of the exact disclaimer accepted.
    /// @return ack Human‑readable disclaimer confirming the caller bears all
    /// tax responsibility.
    function acknowledgeTaxPolicy() external returns (string memory ack) {
        ack = _acknowledge(msg.sender);
    }

    /// @notice Acknowledge the current tax policy on behalf of a user.
    /// @param user Address acknowledging the policy.
    /// @return ack Human-readable disclaimer confirming the caller bears all tax responsibility.
    function acknowledgeFor(address user) external returns (string memory ack) {
        if (!acknowledgers[msg.sender]) revert NotAcknowledger();
        ack = _acknowledge(user);
    }

    function setJobParameters(uint256 maxReward, uint256 stake) external onlyGovernance {
        if (stake > type(uint96).max) revert StakeOverflow();
        jobStake = uint96(stake);
        maxJobReward = maxReward;
        emit JobParametersUpdated(0, stake, maxReward, maxJobDuration, minAgentStake);
    }

    // ---------------------------------------------------------------------
    // Job lifecycle
    // ---------------------------------------------------------------------
    function _createJob(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        bytes32 specHash,
        string calldata uri
    )
        internal
        whenNotPaused
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
        nonReentrant
        returns (uint256 jobId)
    {
        if (reward == 0 && jobStake == 0) revert JobParametersUnset();
        if (reward > type(uint128).max) revert RewardOverflow();
        if (maxJobReward != 0 && reward > maxJobReward) revert RewardTooHigh();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (agentTypes == 0 || agentTypes > 3) revert InvalidAgentTypes();
        if (specHash == bytes32(0)) revert InvalidSpecHash();
        if (
            maxJobDuration > 0 &&
            uint256(deadline) - block.timestamp > maxJobDuration
        ) revert DurationTooLong();
        if (feePct + validatorRewardPct > 100) revert InvalidPercentages();
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(msg.sender)
        ) {
            revert BlacklistedEmployer();
        }
        unchecked {
            nextJobId++;
        }
        jobId = nextJobId;
        uint32 feePctSnapshot = uint32(feePct);
        bytes32 uriHash = keccak256(bytes(uri));
        JobMetadata memory metadata = JobMetadata({
            state: State.Created,
            success: false,
            burnConfirmed: false,
            agentTypes: agentTypes,
            feePct: feePctSnapshot,
            agentPct: 100,
            deadline: deadline,
            assignedAt: 0
        });
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: uint128(reward),
            stake: jobStake,
            burnReceiptAmount: 0,
            uriHash: uriHash,
            resultHash: bytes32(0),
            specHash: specHash,
            packedMetadata: _encodeMetadata(metadata)
        });
        uint256 fee;
        if (address(stakeManager) != address(0) && reward > 0) {
            fee = (reward * feePctSnapshot) / 100;
            stakeManager.lockReward(bytes32(jobId), msg.sender, reward + fee);
            emit JobFunded(jobId, msg.sender, reward, fee);
        }
        emit JobCreated(
            jobId,
            msg.sender,
            address(0),
            reward,
            uint256(jobStake),
            fee,
            specHash,
            uri
        );
    }

    function createJob(
        uint256 reward,
        uint64 deadline,
        bytes32 specHash,
        string calldata uri
    ) external returns (uint256 jobId) {
        jobId = _createJob(reward, deadline, 3, specHash, uri);
    }

    function createJobWithAgentTypes(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        bytes32 specHash,
        string calldata uri
    ) external returns (uint256 jobId) {
        jobId = _createJob(reward, deadline, agentTypes, specHash, uri);
    }

    /**
     * @notice Acknowledge the tax policy and create a job in one transaction.
     * @dev `reward` uses 18-decimal base units. Caller must `approve` the
     *      StakeManager for `reward + fee` $AGIALPHA before calling.
     * @param reward Job reward in $AGIALPHA with 18 decimals.
     * @param uri Metadata URI describing the job.
     * @return jobId Identifier of the newly created job.
     */
    function acknowledgeAndCreateJob(
        uint256 reward,
        uint64 deadline,
        bytes32 specHash,
        string calldata uri
    ) external returns (uint256 jobId) {
        _acknowledge(msg.sender);
        jobId = _createJob(reward, deadline, 3, specHash, uri);
    }

    function acknowledgeAndCreateJobWithAgentTypes(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        bytes32 specHash,
        string calldata uri
    ) external returns (uint256 jobId) {
        _acknowledge(msg.sender);
        jobId = _createJob(reward, deadline, agentTypes, specHash, uri);
    }

    function _applyForJob(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        internal
        whenNotPaused
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        Job storage job = jobs[jobId];
        if (_getState(job) != State.Created) revert NotOpen();
        if (address(reputationEngine) != address(0)) {
            if (reputationEngine.isBlacklisted(msg.sender)) revert BlacklistedAgent();
        }
        if (address(identityRegistry) == address(0)) revert IdentityRegistryNotSet();
        bool authorized =
            agentAuthCache[msg.sender] &&
            agentAuthExpiry[msg.sender] > block.timestamp &&
            agentAuthVersion[msg.sender] == agentAuthCacheVersion;
        bytes32 node;
        bool viaWrapper;
        bool viaMerkle;
        if (!authorized) {
            (authorized, node, viaWrapper, viaMerkle) = identityRegistry
                .verifyAgent(msg.sender, subdomain, proof);
            if (authorized) {
                emit AgentIdentityVerified(
                    msg.sender,
                    node,
                    subdomain,
                    viaWrapper,
                    viaMerkle
                );
                agentAuthCache[msg.sender] = true;
                agentAuthExpiry[msg.sender] =
                    block.timestamp + agentAuthCacheDuration;
                agentAuthVersion[msg.sender] = agentAuthCacheVersion;
            }
        }
        if (!authorized) revert NotAuthorizedAgent();
        uint8 agentTypes = _getAgentTypes(job);
        if (agentTypes > 0) {
            IIdentityRegistry.AgentType aType = identityRegistry.getAgentType(
                msg.sender
            );
            if ((agentTypes & (1 << uint8(aType))) == 0)
                revert AgentTypeNotAllowed();
        }
        if (address(reputationEngine) != address(0)) {
            reputationEngine.onApply(msg.sender);
        }
        if (address(stakeManager) != address(0)) {
            uint256 requiredStake = uint256(minAgentStake);
            if (requiredStake > 0) {
                uint256 currentStake = stakeManager.stakeOf(
                    msg.sender,
                    IStakeManager.Role.Agent
                );
                if (currentStake < requiredStake) {
                    revert InsufficientAgentStake(requiredStake, currentStake);
                }
            }
        }
        if (job.stake > 0 && address(stakeManager) != address(0)) {
            uint64 lockTime;
            uint64 deadline = _getDeadline(job);
            if (uint256(deadline) > block.timestamp) {
                lockTime = uint64(uint256(deadline) - block.timestamp);
            }
            stakeManager.lockStake(msg.sender, uint256(job.stake), lockTime);
        }
        uint256 active = activeJobs[msg.sender];
        uint256 activeLimit = maxActiveJobsPerAgent;
        if (activeLimit != 0 && active >= activeLimit) {
            revert MaxActiveJobsReached(activeLimit);
        }
        uint32 agentPct = 100;
        if (address(stakeManager) != address(0)) {
            agentPct = uint32(stakeManager.getTotalPayoutPct(msg.sender));
        }
        emit ApplicationSubmitted(jobId, msg.sender, subdomain);
        job.agent = msg.sender;
        _setAgentPct(job, agentPct);
        _setState(job, State.Applied);
        _setAssignedAt(job, uint64(block.timestamp));
        activeJobs[msg.sender] = active + 1;
        emit AgentAssigned(jobId, msg.sender, subdomain);
        emit JobApplied(jobId, msg.sender, subdomain);
    }

    function applyForJob(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external nonReentrant {
        _applyForJob(jobId, subdomain, proof);
    }


    /**
     * @notice Acknowledge the current tax policy and apply for a job.
     * @dev No tokens are transferred. Job reward and stake amounts elsewhere
     *      use 18-decimal $AGIALPHA units. Any stake deposits require prior
     *      `approve` calls on the $AGIALPHA token via the `StakeManager`.
     * @param jobId Identifier of the job to apply for.
     */
    function acknowledgeAndApply(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external nonReentrant {
        _acknowledge(msg.sender);
        _applyForJob(jobId, subdomain, proof);
    }

    /**
     * @notice Deposit stake, implicitly acknowledge the tax policy if needed,
     *         and apply for a job in a single call.
     * @dev `amount` uses 18-decimal base units. Caller must `approve` the
     *      `StakeManager` to pull `amount` $AGIALPHA beforehand. If the caller
     *      has not yet acknowledged the tax policy, this helper will do so
     *      automatically on their behalf.
     * @param jobId Identifier of the job to apply for.
     * @param amount Stake amount in $AGIALPHA with 18 decimals.
    */
    function stakeAndApply(
        uint256 jobId,
        uint256 amount,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external nonReentrant {
        _acknowledge(msg.sender);
        stakeManager.depositStakeFor(
            msg.sender,
            IStakeManager.Role.Agent,
            amount
        );
        _applyForJob(jobId, subdomain, proof);
    }

    /// @notice Agent submits work for validation and selects validators.
    /// @param jobId Identifier of the job being submitted.
    /// @param resultHash Hash of the completed work.
    /// @param resultURI Metadata URI describing the completed work.
    function submit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        public
        whenNotPaused
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
        nonReentrant
    {
        Job storage job = jobs[jobId];
        if (_getState(job) != State.Applied) revert InvalidJobState();
        if (msg.sender != job.agent) revert OnlyAgent();
        if (block.timestamp > _getDeadline(job)) revert DeadlinePassed();
        if (address(reputationEngine) != address(0)) {
            if (reputationEngine.isBlacklisted(msg.sender)) revert BlacklistedAgent();
            if (reputationEngine.isBlacklisted(job.employer)) revert BlacklistedEmployer();
        }
        if (address(identityRegistry) == address(0)) revert IdentityRegistryNotSet();
        (bool authorized, bytes32 node, bool viaWrapper, bool viaMerkle) =
            identityRegistry.verifyAgent(msg.sender, subdomain, proof);
        if (!authorized) revert NotAuthorizedAgent();
        emit AgentIdentityVerified(
            msg.sender,
            node,
            subdomain,
            viaWrapper,
            viaMerkle
        );
        uint8 agentTypes = _getAgentTypes(job);
        if (agentTypes > 0) {
            IIdentityRegistry.AgentType aType = identityRegistry.getAgentType(
                msg.sender
            );
            if ((agentTypes & (1 << uint8(aType))) == 0)
                revert AgentTypeNotAllowed();
        }
        job.resultHash = resultHash;
        _setState(job, State.Submitted);
        emit ResultSubmitted(jobId, msg.sender, resultHash, resultURI, subdomain);
        emit JobSubmitted(jobId, msg.sender, resultHash, resultURI, subdomain);
        if (address(validationModule) != address(0)) {
            uint256 entropy = uint256(
                keccak256(
                    abi.encodePacked(
                        jobId,
                        msg.sender,
                        resultHash,
                        block.timestamp,
                        block.prevrandao,
                        blockhash(block.number - 1)
                    )
                )
            );
            (bool burnRequired, bool burnSatisfied) = burnEvidenceStatus(jobId);
            if (burnRequired && !burnSatisfied) {
                pendingValidationEntropy[jobId] = entropy;
                validationStartPending[jobId] = true;
                emit ValidationStartPending(jobId);
            } else {
                _startValidation(jobId, entropy);
            }
        }
    }

    /// @notice Acknowledge the tax policy and submit work in one call.
    function acknowledgeAndSubmit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external {
        _acknowledge(msg.sender);
        submit(jobId, resultHash, resultURI, subdomain, proof);
    }

    /// @notice Record job outcome after validation.
    /// @dev Only the ValidationModule may call this entry point with the
    ///      computed result of the commit-reveal process. This function only
    ///      updates the job state and emits the completion event; the employer
    ///      or governance must call {finalize} separately to settle funds.
    /// @param jobId Identifier of the job being validated.
    /// @param success True if validators approved the job.
    function _finalizeAfterValidation(uint256 jobId, bool success) internal {
        if (msg.sender != address(validationModule)) revert OnlyValidationModule();
        Job storage job = jobs[jobId];
        if (_getState(job) != State.Submitted) revert NotSubmitted();
        _clearValidationStart(jobId);
        _setSuccess(job, success);
        _setState(job, success ? State.Completed : State.Disputed);
        emit JobCompleted(jobId, success);
    }

    /// @notice Record that reputation updates have already been applied for a job.
    /// @param jobId Identifier of the job that triggered the update.
    function markReputationProcessed(uint256 jobId) external {
        if (msg.sender != address(validationModule)) revert OnlyValidationModule();
        reputationProcessed[jobId] = true;
        emit ReputationProcessingMarked(jobId);
    }

    /// @param jobId Identifier of the job being finalised.
    /// @param success True if validators approved the job.
    function finalizeAfterValidation(uint256 jobId, bool success)
        external
        whenNotPaused
        nonReentrant
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        _finalizeAfterValidation(jobId, success);
    }

    function validationComplete(uint256 jobId, bool success)
        external
        whenNotPaused
        nonReentrant
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        _finalizeAfterValidation(jobId, success);
    }

    /// @notice Record a failed job outcome when validation quorum is not met.
    /// @dev This function only updates the job state; the employer or
    ///      governance must later call {finalize} to settle funds and
    ///      reputation changes.
    /// @param jobId Identifier of the job being recorded.
    function forceFinalize(uint256 jobId)
        external
        whenNotPaused
        nonReentrant
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        if (msg.sender != address(validationModule)) revert OnlyValidationModule();
        Job storage job = jobs[jobId];
        if (_getState(job) != State.Submitted) revert NotSubmitted();
        _clearValidationStart(jobId);
        _setSuccess(job, false);
        _setState(job, State.Completed);
        emit JobCompleted(jobId, false);
    }

    /// @notice Receive validation outcome from the ValidationModule
    /// @param jobId Identifier of the job
    /// @param success True if validators approved the job
    /// @param validators Validators that participated in validation
    function onValidationResult(
        uint256 jobId,
        bool success,
        address[] calldata validators
    )
        external
        whenNotPaused
        nonReentrant
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        _clearValidatorData(jobId);
        if (validators.length > 0) {
            address[] storage storedValidators = jobValidators[jobId];
            for (uint256 i; i < validators.length;) {
                address validator = validators[i];
                storedValidators.push(validator);
                jobValidatorVotes[jobId][validator] = validationModule.votes(
                    jobId,
                    validator
                );
                unchecked {
                    ++i;
                }
            }
        }
        _finalizeAfterValidation(jobId, success);
    }

    /// @notice Agent or employer disputes a job outcome with a hash of off-chain evidence.
    /// @param jobId Identifier of the disputed job.
    /// @param evidenceHash Keccak256 hash of the evidence stored off-chain.
    /// @param reason Plain-text description or URI describing the dispute.
    function dispute(
        uint256 jobId,
        bytes32 evidenceHash,
        string calldata reason
    )
        public
        whenNotPaused
        nonReentrant
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        _dispute(jobId, evidenceHash, reason);
    }

    /// @notice Backwards-compatible wrapper for legacy integrations.
    /// @dev Calls {dispute} with the provided evidence hash.
    function raiseDispute(uint256 jobId, bytes32 evidenceHash) public {
        _dispute(jobId, evidenceHash, "");
    }

    /// @notice Overload supporting plain-text dispute reasons.
    /// @param jobId Identifier of the disputed job.
    /// @param reason Plain-text or URI reason for the dispute.
    function raiseDispute(uint256 jobId, string calldata reason) public {
        _dispute(jobId, bytes32(0), reason);
    }

    /**
     * @notice Acknowledge the tax policy if needed and raise a dispute with
     *         supporting evidence stored off-chain.
     * @dev No tokens are transferred; any stake requirements elsewhere use
     *      18-decimal $AGIALPHA units that must have been approved previously.
     * @param jobId Identifier of the disputed job.
     * @param evidenceHash Keccak256 hash of the off-chain evidence.
     */
    function acknowledgeAndDispute(
        uint256 jobId,
        bytes32 evidenceHash,
        string calldata reason
    ) public {
        if (
            address(taxPolicy) != address(0) &&
            !taxPolicy.hasAcknowledged(msg.sender)
        ) {
            _acknowledge(msg.sender);
        }
        _dispute(jobId, evidenceHash, reason);
    }

    /// @notice Backwards-compatible helper without a reason string.
    function acknowledgeAndDispute(uint256 jobId, bytes32 evidenceHash) external {
        _dispute(jobId, evidenceHash, "");
    }

    function _dispute(
        uint256 jobId,
        bytes32 evidenceHash,
        string memory reason
    ) internal {
        if (evidenceHash == bytes32(0) && bytes(reason).length == 0)
            revert EvidenceMissing();
        Job storage job = jobs[jobId];
        if (msg.sender != job.agent && msg.sender != job.employer)
            revert OnlyParticipant();
        State state = _getState(job);
        bool success = _getSuccess(job);
        if (!(state == State.Completed || (state == State.Disputed && !success))) {
            revert CannotDispute();
        }
        if (state == State.Completed) {
            _setState(job, State.Disputed);
        }
        if (address(reputationEngine) != address(0)) {
            if (reputationEngine.isBlacklisted(msg.sender)) revert Blacklisted();
            if (reputationEngine.isBlacklisted(job.agent)) revert BlacklistedAgent();
            if (reputationEngine.isBlacklisted(job.employer)) revert BlacklistedEmployer();
        }
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute(jobId, msg.sender, evidenceHash, reason);
        }
        emit JobDisputed(jobId, msg.sender);
    }

    /// @notice Resolve a dispute relayed by the dispute module.
    /// @dev After resolution this function only records the result, moving the
    ///      job to the completed state. The employer or governance must call
    ///      {finalize} separately to settle funds and reputation.
    /// @param jobId Identifier of the disputed job
    /// @param employerWins True if the employer won the dispute
    function resolveDispute(uint256 jobId, bool employerWins)
        external
        whenNotPaused
        nonReentrant
    {
        if (msg.sender != address(disputeModule)) revert OnlyDisputeModule();
        Job storage job = jobs[jobId];
        if (_getState(job) != State.Disputed) revert NoDispute();

        _setSuccess(job, !employerWins);
        _setState(job, State.Completed);
        _clearValidatorData(jobId);
        if (reputationProcessed[jobId]) {
            delete reputationProcessed[jobId];
        }
        emit DisputeResolved(jobId, employerWins);
    }

    /// @notice Finalize a job and trigger payouts and reputation changes.
    /// @dev The dispute module may call this without acknowledgement as it
    ///      merely relays the arbiter's ruling and holds no tax liability.
    function finalize(uint256 jobId)
        public
        whenNotPaused
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
        nonReentrant
    {
        _finalizeByEmployer(jobId);
    }

    function _finalizeByEmployer(uint256 jobId) internal {
        Job storage job = jobs[jobId];
        if (msg.sender != job.employer && msg.sender != address(governance)) {
            revert OnlyEmployer();
        }
        _finalize(jobId);
    }

    function _finalize(uint256 jobId) internal whenNotPaused {
        Job storage job = jobs[jobId];
        if (_getState(job) != State.Completed) revert NotReady();
        bool isGov = msg.sender == address(governance);
        _clearValidationStart(jobId);
        uint256 burnRate = address(stakeManager) != address(0)
            ? stakeManager.burnPct()
            : 0;
        bool agentBlacklisted;
        bool employerBlacklisted;
        if (address(reputationEngine) != address(0)) {
            agentBlacklisted = reputationEngine.isBlacklisted(job.agent);
            employerBlacklisted = reputationEngine.isBlacklisted(job.employer);
            if (!isGov) {
                if (reputationEngine.isBlacklisted(msg.sender)) revert Blacklisted();
                if (agentBlacklisted) revert BlacklistedAgent();
                if (employerBlacklisted) revert BlacklistedEmployer();
            }
        }
        _setState(job, State.Finalized);
        bytes32 jobKey = bytes32(jobId);
        bool fundsRedirected;
        address[] memory validators = jobValidators[jobId];
        bool success = _getSuccess(job);
        bool reputationHandled = reputationProcessed[jobId];
        if (success) {
            IFeePool pool = feePool;
            uint256 validatorReward;
            if (validators.length > 0 && validatorRewardPct > 0) {
                validatorReward =
                    (uint256(job.reward) * validatorRewardPct) / 100;
            }

            uint256 rewardAfterValidator =
                uint256(job.reward) - validatorReward;
            uint256 fee;
            uint32 agentPctRaw = _getAgentPct(job);
            uint256 agentPct = agentPctRaw == 0 ? 100 : agentPctRaw;
            if (address(stakeManager) != address(0)) {
                if (address(pool) != address(0) && job.reward > 0) {
                    fee = (uint256(job.reward) * _getFeePct(job)) / 100;
                }
            }
            uint256 agentAmount = (rewardAfterValidator * agentPct) / 100;
            if (address(stakeManager) != address(0)) {
                address payee = job.agent;
                if (isGov && treasury != address(0) && agentBlacklisted) {
                    payee = treasury;
                    fundsRedirected = true;
                }

                address employerParam = isGov ? job.employer : msg.sender;
                stakeManager.finalizeJobFundsWithPct(
                    jobKey,
                    employerParam,
                    payee,
                    agentPct,
                    rewardAfterValidator,
                    validatorReward,
                    fee,
                    pool,
                    isGov
                );

                if (validatorReward > 0) {
                    if (validators.length > 0) {
                        stakeManager.distributeValidatorRewards(
                            jobKey,
                            validatorReward
                        );
                    } else {
                        stakeManager.releaseReward(
                            jobKey,
                            job.employer,
                            payee,
                            validatorReward
                        );
                    }
                }
                if (job.stake > 0) {
                    if (isGov && treasury != address(0) && agentBlacklisted) {
                        stakeManager.slash(
                            job.agent,
                            IStakeManager.Role.Agent,
                            uint256(job.stake),
                            treasury,
                            validators
                        );
                    } else {
                        stakeManager.releaseStake(job.agent, uint256(job.stake));
                    }
                }
                if (_getBurnConfirmed(job) && burnRate > 0) {
                    uint256 expectedBurn = (agentAmount * burnRate) / 100;
                    if (uint256(job.burnReceiptAmount) != expectedBurn) {
                        emit BurnDiscrepancy(
                            jobId,
                            job.burnReceiptAmount,
                            expectedBurn
                        );
                    }
                }
            }
            if (address(reputationEngine) != address(0) && !reputationHandled) {
                uint256 completionTime =
                    block.timestamp - uint256(_getAssignedAt(job));
                uint256 payout = agentAmount * 1e12;
                uint256 agentGain = reputationEngine.calculateReputationPoints(
                    payout,
                    completionTime
                );
                reputationEngine.onFinalize(
                    job.agent,
                    true,
                    payout,
                    completionTime
                );
                if (validators.length > 0) {
                    for (uint256 i; i < validators.length;) {
                        address val = validators[i];
                        if (jobValidatorVotes[jobId][val]) {
                            reputationEngine.rewardValidator(val, agentGain);
                        }
                        unchecked {
                            ++i;
                        }
                    }
                }
            }
            if (address(certificateNFT) != address(0)) {
                certificateNFT.mint(job.agent, jobId, job.uriHash);
            }
            uint256 bonus = agentAmount - rewardAfterValidator;
            emit JobPayout(jobId, job.agent, rewardAfterValidator, bonus, fee);
        } else {
            if (address(stakeManager) != address(0)) {
                uint256 fee = (uint256(job.reward) * _getFeePct(job)) / 100;
                address recipient = job.employer;
                if (isGov && treasury != address(0) && employerBlacklisted) {
                    recipient = treasury;
                    fundsRedirected = true;
                }
                if (job.reward > 0) {
                    stakeManager.releaseReward(
                        jobKey,
                        job.employer,
                        recipient,
                        uint256(job.reward) + fee
                    );
                }
                if (job.stake > 0) {
                    stakeManager.slash(
                        job.agent,
                        IStakeManager.Role.Agent,
                        uint256(job.stake),
                        recipient,
                        validators
                    );
                }
            }
            if (address(reputationEngine) != address(0) && !reputationHandled) {
                reputationEngine.onFinalize(job.agent, false, 0, 0);
            }
        }
        if (success) {
            employerStats[job.employer].successful++;
        } else {
            employerStats[job.employer].failed++;
        }
        emit JobFinalized(jobId, job.agent);
        if (isGov) {
            emit GovernanceFinalized(jobId, msg.sender, fundsRedirected);
        }
        address agentAddr = job.agent;
        if (agentAddr != address(0)) {
            uint256 activeCount = activeJobs[agentAddr];
            if (activeCount > 0) {
                activeJobs[agentAddr] = activeCount - 1;
            }
        }
        _clearValidatorData(jobId);
        if (reputationProcessed[jobId]) {
            delete reputationProcessed[jobId];
        }
    }

    /// @notice Acknowledge the tax policy and finalise the job in one call.
    /// @param jobId Identifier of the job to finalise
    function acknowledgeAndFinalize(uint256 jobId) external {
        _acknowledge(msg.sender);
        finalize(jobId);
    }

    /// @notice Acknowledge the tax policy and cancel a job in one call.
    /// @param jobId Identifier of the job to cancel
    function acknowledgeAndCancel(uint256 jobId) external {
        _acknowledge(msg.sender);
        cancelJob(jobId);
    }

    /// @notice Cancel an unassigned job and refund the employer.
    /// @dev Convenience wrapper matching earlier interface expectations.
    /// Calls {cancelJob} which handles tax acknowledgement checks and
    /// refunds any locked reward back to the employer.
    /// @param jobId Identifier of the job to cancel.
    function cancel(uint256 jobId) external {
        cancelJob(jobId);
    }

    /// @notice Cancel a job before completion and refund the employer.
    function _cancelJob(uint256 jobId) internal whenNotPaused {
        Job storage job = jobs[jobId];
        if (!(_getState(job) == State.Created && job.agent == address(0)))
            revert CannotCancel();
        _setState(job, State.Cancelled);
        if (address(stakeManager) != address(0) && job.reward > 0) {
            uint256 fee = (uint256(job.reward) * _getFeePct(job)) / 100;
            stakeManager.releaseReward(
                bytes32(jobId),
                job.employer,
                job.employer,
                uint256(job.reward) + fee
            );
        }
        _clearValidatorData(jobId);
        if (reputationProcessed[jobId]) {
            delete reputationProcessed[jobId];
        }
        emit JobCancelled(jobId);
    }

    function cancelJob(uint256 jobId)
        public
        nonReentrant
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        Job storage job = jobs[jobId];
        if (msg.sender != job.employer) revert OnlyEmployer();
        if (address(reputationEngine) != address(0)) {
            if (reputationEngine.isBlacklisted(msg.sender)) revert BlacklistedEmployer();
        }
        _cancelJob(jobId);
    }

    /// @notice Owner can delist an unassigned job and refund the employer.
    /// @param jobId Identifier of the job to delist.
    function delistJob(uint256 jobId) external onlyGovernance {
        _cancelJob(jobId);
    }

    /// @notice Mark an applied job as timed out and settle funds directly.
    /// @param jobId Identifier of the job to mark as timed out.
    function claimTimeout(uint256 jobId)
        external
        whenNotPaused
        nonReentrant
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        Job storage job = jobs[jobId];
        address gov = address(governance);
        if (msg.sender != job.employer && msg.sender != gov) {
            revert OnlyEmployer();
        }
        if (_getState(job) != State.Applied) revert InvalidJobState();
        uint256 expiry = uint256(_getDeadline(job)) + expirationGracePeriod;
        if (block.timestamp <= expiry) revert CannotExpire();

        address employer = job.employer;
        address agent = job.agent;
        uint128 reward = job.reward;
        uint96 stakeAmount = job.stake;
        uint32 feePctSnapshot = _getFeePct(job);

        _setSuccess(job, false);
        _setState(job, State.Finalized);

        if (address(stakeManager) != address(0)) {
            bytes32 jobKey = bytes32(jobId);
            uint256 fee = (uint256(reward) * feePctSnapshot) / 100;
            uint256 totalRefund = uint256(reward) + fee;
            if (totalRefund > 0) {
                stakeManager.releaseReward(jobKey, employer, employer, totalRefund);
            }
            if (stakeAmount > 0 && agent != address(0)) {
                stakeManager.slash(
                    agent,
                    IStakeManager.Role.Agent,
                    uint256(stakeAmount),
                    employer
                );
            }
        }

        employerStats[employer].failed++;

        job.agent = address(0);
        _setAgentPct(job, 0);
        _setAssignedAt(job, 0);
        job.reward = 0;
        job.stake = 0;
        _setBurnConfirmed(job, false);
        job.burnReceiptAmount = 0;
        job.resultHash = bytes32(0);

        if (agent != address(0)) {
            uint256 activeCount = activeJobs[agent];
            if (activeCount > 0) {
                activeJobs[agent] = activeCount - 1;
            }
        }
        _clearValidatorData(jobId);
        if (reputationProcessed[jobId]) {
            delete reputationProcessed[jobId];
        }
        emit JobTimedOut(jobId, msg.sender);
    }

    /// @notice Cancel an assigned job that failed to submit before its deadline.
    /// @dev Only the employer or governance may trigger this after the deadline.
    /// @param jobId Identifier of the job to cancel.
    function cancelExpiredJob(uint256 jobId)
        public
        onlyAfterDeadline(jobId)
        whenNotPaused
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
        nonReentrant
    {
        Job storage job = jobs[jobId];
        if (msg.sender != job.employer && msg.sender != address(governance)) {
            revert OnlyEmployer();
        }
        _setSuccess(job, false);
        _setState(job, State.Completed);
        _finalize(jobId);
        emit JobExpired(jobId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------------
    /// @dev Prevent accidental ETH transfers; this registry never holds funds
    /// and cannot accrue tax liabilities. All value flows through the
    /// StakeManager or DisputeModule according to participant actions.
    receive() external payable {
        revert("JobRegistry: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("JobRegistry: no ether");
    }
}


