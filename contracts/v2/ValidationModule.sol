// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IJobRegistryTax} from "./interfaces/IJobRegistryTax.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {IRandaoCoordinator} from "./interfaces/IRandaoCoordinator.sol";
import {TaxAcknowledgement} from "./libraries/TaxAcknowledgement.sol";

error InvalidJobRegistry();
error InvalidStakeManager();
error InvalidValidatorBounds();
error InvalidWindows();
error PoolLimitExceeded();
error ZeroValidatorAddress();
error ZeroIdentityRegistry();
error InvalidIdentityRegistry();
error InvalidSampleSize();
error SampleSizeTooSmall();
error InvalidApprovalThreshold();
error InvalidSlashingPercentage();
error InvalidArrayLength();
error InvalidCommitWindow();
error InvalidRevealWindow();
error InvalidPercentage();
error InvalidApprovals();
error ValidatorsAlreadySelected();
error InsufficientValidators();
error StakeManagerNotSet();
error OnlyJobRegistry();
error JobNotSubmitted();
error ValidatorPoolTooSmall();
error BlacklistedValidator();
error NotValidator();
error UnauthorizedValidator();
error NoStake();
error AlreadyCommitted();
error CommitPhaseActive();
error RevealPhaseClosed();
error CommitPhaseClosed();
error CommitMissing();
error AlreadyRevealed();
error InvalidReveal();
error InvalidBurnReceipt();
error BurnEvidenceIncomplete();
error AlreadyTallied();
error RevealPending();
error UnauthorizedCaller();
error NotOwnerOrPauserManager();
error ValidatorBanned();
error InvalidPenalty();
error InvalidForceFinalizeGrace();
error InvalidFailoverAction();
error RevealExtensionRequired();
error FailoverEscalated();
error NoActiveRound();

/// @title ValidationModule
/// @notice Handles validator selection and commit–reveal voting for jobs.
/// @dev Holds no ether and keeps the owner and contract tax neutral; only
///      participating validators and job parties bear tax obligations. Validator
///      selection mixes entropy from multiple participants: callers may
///      contribute random values which are XORed together and later combined
///      with recent block data to mitigate miner bias.
contract ValidationModule is IValidationModule, Ownable, TaxAcknowledgement, Pausable, ReentrancyGuard {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    /// @notice Domain separator used for typed commit hashes.
    bytes32 public immutable DOMAIN_SEPARATOR;

    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IIdentityRegistry public identityRegistry;
    IRandaoCoordinator public randaoCoordinator;
    address public pauser;
    address public pauserManager;

    // timing configuration
    uint256 public commitWindow;
    uint256 public revealWindow;

    // validator bounds per job
    uint256 public minValidators;
    uint256 public maxValidators;
    uint256 public validatorsPerJob;

    /// @notice Hard limit on the number of validators any single job may use.
    uint256 public maxValidatorsPerJob = 100;

    uint256 public constant DEFAULT_COMMIT_WINDOW = 30 minutes;
    uint256 public constant DEFAULT_REVEAL_WINDOW = 30 minutes;
    uint256 public constant DEFAULT_MIN_VALIDATORS = 3;
    uint256 public constant DEFAULT_MAX_VALIDATORS = 5;
    uint256 public constant DEFAULT_APPROVAL_THRESHOLD = 66;
    uint256 public constant DEFAULT_REVEAL_QUORUM_PCT = 67;
    uint256 public constant DEFAULT_FORCE_FINALIZE_GRACE = 1 hours;
    uint256 public forceFinalizeGrace = DEFAULT_FORCE_FINALIZE_GRACE;

    // slashing percentage applied to validator stake for incorrect votes
    uint256 public validatorSlashingPercentage = 50;
    // percentage of total stake required for approval
    uint256 public approvalThreshold = DEFAULT_APPROVAL_THRESHOLD;
    // absolute number of validator approvals required
    uint256 public requiredValidatorApprovals;

    /// @notice Whether the approval count should auto-track the configured
    ///         supermajority percentage.
    bool public autoApprovalTarget = true;

    /// @notice Minimum percentage of the committee that must reveal for quorum.
    uint256 public revealQuorumPct = DEFAULT_REVEAL_QUORUM_PCT;

    /// @notice Absolute floor on the number of reveals required for quorum.
    uint256 public minRevealValidators = DEFAULT_MIN_VALIDATORS;

    // pool of validators
    address[] public validatorPool;
    // maximum number of pool entries to sample on-chain
    uint256 public validatorPoolSampleSize = 100;
    // hard cap on validator pool size; default chosen to keep on-chain
    // iteration within practical gas limits while allowing governance to
    // raise or lower it via the existing setter.
    uint256 public maxValidatorPoolSize = 1000;

    /// @notice Current strategy used for validator sampling.
    IValidationModule.SelectionStrategy public selectionStrategy;

    /// @notice Starting index for the rotating window strategy.
    uint256 public validatorPoolRotation;

    // optional override for validators without ENS identity
    mapping(address => string) public validatorSubdomains;

    // cache successful validator authorizations
    mapping(address => bool) public validatorAuthCache;
    mapping(address => uint256) public validatorAuthExpiry;
    mapping(address => uint256) public validatorAuthVersion;
    uint256 public validatorAuthCacheVersion;
    uint256 public validatorAuthCacheDuration;

    struct Round {
        address[] validators;
        address[] participants;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 approvals;
        uint256 rejections;
        uint256 revealedCount;
        bool tallied;
        uint256 committeeSize;
        uint64 earlyFinalizeEligibleAt;
        bool earlyFinalized;
    }

    struct FailoverState {
        IValidationModule.FailoverAction lastAction;
        uint64 extensions;
        uint64 lastExtendedTo;
        uint64 lastTriggeredAt;
        bool escalated;
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => FailoverState) public failoverStates;
    mapping(uint256 => mapping(address => mapping(uint256 => bytes32))) public commitments;
    mapping(uint256 => mapping(address => bool)) public revealed;
    mapping(uint256 => mapping(address => bool)) public votes;
    mapping(uint256 => mapping(address => uint256)) public validatorStakes;
    mapping(uint256 => mapping(address => uint256)) public validatorStakeLocks;
    mapping(uint256 => mapping(address => bool)) private _validatorLookup;
    mapping(uint256 => uint256) public jobNonce;
    // Aggregated entropy contributed by job parties prior to final selection.
    // Each call to `selectValidators` while the target block has not yet been
    // mined XORs a caller-supplied value (mixed with the caller address) into
    // this pool.
    mapping(uint256 => uint256) public pendingEntropy;
    // Block number whose hash will be used to finalize committee selection.
    mapping(uint256 => uint256) public selectionBlock;

    // Track unique entropy contributors for each job and round
    mapping(uint256 => uint256) public entropyContributorCount;
    mapping(uint256 => uint256) public entropyRound;
    mapping(uint256 => mapping(uint256 => mapping(address => bool)))
        private entropyContributed;
    uint256 public constant MIN_ENTROPY_CONTRIBUTORS = 2;

    /// @notice Selection seed captured for each job to prevent post-selection manipulation.
    mapping(uint256 => bytes32) public selectionSeeds;

    /// @notice Basis points slashed from validator stake when they fail to reveal.
    uint256 public nonRevealPenaltyBps = 50; // 0.5%

    /// @notice Number of blocks a validator is banned from new committees after failing to reveal.
    uint256 public nonRevealBanBlocks = 7_200; // ~1 day assuming 12s blocks

    /// @notice Cool-off delay before an early finalize may be triggered once quorum is met.
    uint256 public earlyFinalizeDelay = 5 minutes;

    /// @notice Block number until which a validator is banned from committee selection.
    mapping(address => uint256) public validatorBanUntil;

    event ValidatorsUpdated(address[] validators);
    event ReputationEngineUpdated(address engine);
    event TimingUpdated(uint256 commitWindow, uint256 revealWindow);
    event ValidatorBoundsUpdated(uint256 minValidators, uint256 maxValidators);
    event ValidatorSlashingPctUpdated(uint256 pct);
    event ApprovalThresholdUpdated(uint256 pct);
    event ValidatorsPerJobUpdated(uint256 count);
    event CommitWindowUpdated(uint256 window);
    event RevealWindowUpdated(uint256 window);
    event RequiredValidatorApprovalsUpdated(uint256 count);
    event JobRegistryUpdated(address registry);
    event StakeManagerUpdated(address manager);
    event ModulesUpdated(address indexed jobRegistry, address indexed stakeManager);
    event IdentityRegistryUpdated(address registry);
    event JobNonceReset(uint256 indexed jobId);
    event ValidatorPoolSampleSizeUpdated(uint256 size);
    event MaxValidatorPoolSizeUpdated(uint256 size);
    event ValidatorAuthCacheDurationUpdated(uint256 duration);
    event RevealQuorumUpdated(uint256 pct, uint256 minValidators);
    event ValidatorAuthCacheVersionBumped(uint256 version);
    event SelectionReset(uint256 indexed jobId);
    event PauserUpdated(address indexed pauser);
    event PauserManagerUpdated(address indexed pauserManager);
    event NonRevealPenaltyUpdated(uint256 penaltyBps, uint256 banBlocks);
    event EarlyFinalizeDelayUpdated(uint256 delay);
    event ForceFinalizeGraceUpdated(uint256 grace);
    event AutoApprovalTargetUpdated(bool enabled);
    event ValidatorBanApplied(address indexed validator, uint256 untilBlock);
    event SelectionSeedRecorded(uint256 indexed jobId, bytes32 seed);
    /// @notice Emitted when a validator's ENS identity is verified.
    event ValidatorIdentityVerified(
        address indexed validator,
        bytes32 indexed node,
        string label,
        bool viaWrapper,
        bool viaMerkle
    );

    modifier onlyOwnerOrPauser() {
        require(
            msg.sender == owner() || msg.sender == pauser,
            "owner or pauser only"
        );
        _;
    }

    function setPauser(address _pauser) external {
        if (msg.sender != owner() && msg.sender != pauserManager) {
            revert NotOwnerOrPauserManager();
        }
        pauser = _pauser;
        emit PauserUpdated(_pauser);
    }

    function setPauserManager(address manager) external onlyOwner {
        pauserManager = manager;
        emit PauserManagerUpdated(manager);
    }

    /// @notice Update non-reveal penalty parameters.
    /// @param penaltyBps Slash applied in basis points of validator stake.
    /// @param banBlocks Number of blocks a validator is banned from new committees.
    function setNonRevealPenalty(uint256 penaltyBps, uint256 banBlocks)
        external
        onlyOwner
    {
        if (penaltyBps > 1_000) revert InvalidPenalty();
        nonRevealPenaltyBps = penaltyBps;
        nonRevealBanBlocks = banBlocks;
        emit NonRevealPenaltyUpdated(penaltyBps, banBlocks);
    }

    /// @notice Update the reveal quorum requirements.
    /// @param pct Percentage of the committee that must reveal (0-100).
    /// @param minValidators_ Absolute minimum number of reveals required.
    function setRevealQuorum(uint256 pct, uint256 minValidators_)
        external
        onlyOwner
    {
        if (pct > 100) revert InvalidPercentage();
        if (minValidators_ == 0) revert InvalidValidatorBounds();
        revealQuorumPct = pct;
        minRevealValidators = minValidators_;
        emit RevealQuorumUpdated(pct, minValidators_);
    }

    /// @notice Update the cool-off delay before early finalization is permitted.
    /// @param delay Seconds to wait after quorum is met before allowing finalize.
    function setEarlyFinalizeDelay(uint256 delay) external onlyOwner {
        earlyFinalizeDelay = delay;
        emit EarlyFinalizeDelayUpdated(delay);
    }

    /// @notice Update the grace period before force finalize can be triggered.
    /// @param grace Additional seconds allowed after the reveal window closes.
    function setForceFinalizeGrace(uint256 grace) external onlyOwner {
        if (grace == 0) revert InvalidForceFinalizeGrace();
        forceFinalizeGrace = grace;
        emit ForceFinalizeGraceUpdated(grace);
    }

    /// @notice Trigger a circuit-breaker style failover for an in-flight validation round.
    /// @param jobId Identifier of the job whose validation flow is being adjusted.
    /// @param action Failover action to execute (reveal extension or dispute escalation).
    /// @param extension Additional seconds to append to the reveal window when extending.
    /// @param reason Human-readable context for observability purposes.
    function triggerFailover(
        uint256 jobId,
        IValidationModule.FailoverAction action,
        uint64 extension,
        string calldata reason
    ) external onlyOwner whenNotPaused {
        if (action == IValidationModule.FailoverAction.None)
            revert InvalidFailoverAction();
        FailoverState storage state = failoverStates[jobId];
        string memory rationale = bytes(reason).length == 0
            ? "validation-failover"
            : reason;

        if (action == IValidationModule.FailoverAction.EscalateDispute) {
            if (state.escalated) revert FailoverEscalated();
        }

        Round storage r = rounds[jobId];
        if (r.commitDeadline == 0) revert NoActiveRound();
        if (r.tallied) revert AlreadyTallied();

        if (action == IValidationModule.FailoverAction.ExtendReveal) {
            if (extension == 0) revert RevealExtensionRequired();
            uint256 newDeadline = r.revealDeadline + extension;
            r.revealDeadline = newDeadline;
            state.lastAction = IValidationModule.FailoverAction.ExtendReveal;
            state.extensions += 1;
            state.lastExtendedTo = uint64(newDeadline);
            state.lastTriggeredAt = uint64(block.timestamp);
            emit ValidationFailover(jobId, action, newDeadline, rationale);
            return;
        }

        if (action == IValidationModule.FailoverAction.EscalateDispute) {
            state.escalated = true;
            state.lastAction = IValidationModule.FailoverAction.EscalateDispute;
            state.lastTriggeredAt = uint64(block.timestamp);
            uint256 deadline = r.revealDeadline;
            jobRegistry.escalateToDispute(jobId, rationale);
            _cleanup(jobId);
            emit ValidationFailover(jobId, action, deadline, rationale);
            return;
        }

        revert InvalidFailoverAction();
    }
    event ValidatorPoolRotationUpdated(uint256 newRotation);
    event RandaoCoordinatorUpdated(address coordinator);
    event MaxValidatorsPerJobUpdated(uint256 maxValidators);
    /// @notice Emitted when an additional validator is added or removed.
    /// @param validator Address being updated.
    /// @param allowed True if the validator is whitelisted, false if removed.

    /// @notice Require caller to acknowledge current tax policy via JobRegistry.

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        uint256 _commitWindow,
        uint256 _revealWindow,
        uint256 _minValidators,
        uint256 _maxValidators,
        address[] memory _validatorPool
    ) Ownable(msg.sender) {
        DOMAIN_SEPARATOR =
            keccak256(
                abi.encode(
                    keccak256(
                        "ValidationModule(string version,address verifyingContract,uint256 chainId)"
                    ),
                    keccak256(bytes("1")),
                    address(this),
                    block.chainid
                )
            );
        if (address(_jobRegistry) != address(0)) {
            jobRegistry = _jobRegistry;
            emit JobRegistryUpdated(address(_jobRegistry));
        }
        if (address(_stakeManager) != address(0)) {
            stakeManager = _stakeManager;
            emit StakeManagerUpdated(address(_stakeManager));
        }
        if (
            address(_jobRegistry) != address(0) ||
            address(_stakeManager) != address(0)
        ) {
            emit ModulesUpdated(
                address(_jobRegistry),
                address(_stakeManager)
            );
        }
        commitWindow =
            _commitWindow == 0 ? DEFAULT_COMMIT_WINDOW : _commitWindow;
        revealWindow =
            _revealWindow == 0 ? DEFAULT_REVEAL_WINDOW : _revealWindow;
        emit TimingUpdated(commitWindow, revealWindow);

        minValidators =
            _minValidators == 0 ? DEFAULT_MIN_VALIDATORS : _minValidators;
        maxValidators =
            _maxValidators == 0 ? DEFAULT_MAX_VALIDATORS : _maxValidators;
        if (minValidators < 3) revert InvalidValidatorBounds();
        minRevealValidators = minValidators;
        emit ValidatorBoundsUpdated(minValidators, maxValidators);
        validatorsPerJob = minValidators;
        emit ValidatorsPerJobUpdated(validatorsPerJob);

        _syncRequiredValidatorApprovals();

        emit ApprovalThresholdUpdated(approvalThreshold);

        if (commitWindow == 0 || revealWindow == 0) revert InvalidWindows();
        if (maxValidators < minValidators) revert InvalidValidatorBounds();
        if (_validatorPool.length != 0) {
            validatorPool = _validatorPool;
            emit ValidatorsUpdated(_validatorPool);
        }
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Update the list of eligible validators.
    /// @param newPool Addresses of validators.
    function setValidatorPool(address[] calldata newPool)
        external
        onlyOwner
    {
        if (newPool.length > maxValidatorPoolSize) revert PoolLimitExceeded();
        for (uint256 i = 0; i < newPool.length; i++) {
            if (newPool[i] == address(0)) revert ZeroValidatorAddress();
        }
        validatorPool = newPool;
        bumpValidatorAuthCacheVersion();
        emit ValidatorsUpdated(newPool);
    }

    /// @notice Update the reputation engine used for validator feedback.
    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    /// @notice Update the JobRegistry reference.
    function setJobRegistry(IJobRegistry registry) external onlyOwner {
        if (address(registry) == address(0) || registry.version() != 2) {
            revert InvalidJobRegistry();
        }
        jobRegistry = registry;
        emit JobRegistryUpdated(address(registry));
        emit ModulesUpdated(address(registry), address(stakeManager));
    }

    /// @notice Update the StakeManager reference.
    function setStakeManager(IStakeManager manager) external onlyOwner {
        if (address(manager) == address(0) || manager.version() != 2) {
            revert InvalidStakeManager();
        }
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
        emit ModulesUpdated(address(jobRegistry), address(manager));
    }

    /// @notice Update the identity registry used for validator verification.
    function setIdentityRegistry(IIdentityRegistry registry) external onlyOwner {
        if (address(registry) == address(0)) revert ZeroIdentityRegistry();
        if (registry.version() != 2) revert InvalidIdentityRegistry();
        identityRegistry = registry;
        emit IdentityRegistryUpdated(address(registry));
    }

    /// @notice Set the Randao coordinator used for randomness.
    /// @param coordinator Address of the RandaoCoordinator contract.
    function setRandaoCoordinator(IRandaoCoordinator coordinator)
        external
        onlyOwner
    {
        randaoCoordinator = coordinator;
        emit RandaoCoordinatorUpdated(address(coordinator));
    }

    /// @notice Pause validation operations
    function pause() external onlyOwnerOrPauser {
        _pause();
    }

    /// @notice Resume validation operations
    function unpause() external onlyOwnerOrPauser {
        _unpause();
    }

    /// @notice Update the maximum number of pool entries sampled during selection.
    /// @param size Maximum number of validators examined on-chain.
    function setValidatorPoolSampleSize(uint256 size) external onlyOwner {
        if (size == 0) revert InvalidSampleSize();
        if (size > maxValidatorPoolSize) revert PoolLimitExceeded();
        if (size < validatorsPerJob) revert SampleSizeTooSmall();
        validatorPoolSampleSize = size;
        emit ValidatorPoolSampleSizeUpdated(size);
    }

    /// @notice Update the maximum allowable size of the validator pool.
    /// @param size Maximum number of validators permitted in the pool.
    function setMaxValidatorPoolSize(uint256 size) external onlyOwner {
        if (size == 0) revert InvalidSampleSize();
        if (size < validatorsPerJob) revert InvalidValidatorBounds();
        if (size < validatorPoolSampleSize) revert InvalidSampleSize();
        maxValidatorPoolSize = size;
        emit MaxValidatorPoolSizeUpdated(size);
    }

    /// @notice Update the maximum number of validators allowed per job.
    /// @param max Maximum validators permitted for any job.
    function setMaxValidatorsPerJob(uint256 max) external onlyOwner {
        if (max < minValidators) revert InvalidValidatorBounds();
        maxValidatorsPerJob = max;
        if (validatorsPerJob > max) {
            validatorsPerJob = max;
            emit ValidatorsPerJobUpdated(max);
        }
        if (maxValidators > max) {
            maxValidators = max;
            emit ValidatorBoundsUpdated(minValidators, max);
        }
        emit MaxValidatorsPerJobUpdated(max);
    }

    /// @notice Configure the validator sampling strategy.
    /// @param strategy Sampling algorithm to employ when selecting validators.
    function setSelectionStrategy(IValidationModule.SelectionStrategy strategy) external onlyOwner {
        selectionStrategy = strategy;
        emit SelectionStrategyUpdated(strategy);
    }

    /// @notice Update the duration for cached validator authorizations.
    /// @param duration Seconds an authorization remains valid in cache.
    function setValidatorAuthCacheDuration(uint256 duration) external onlyOwner {
        validatorAuthCacheDuration = duration;
        emit ValidatorAuthCacheDurationUpdated(duration);
    }

    /// @notice Increment the validator authorization cache version,
    /// invalidating all existing cache entries.
    function bumpValidatorAuthCacheVersion() public onlyOwner {
        unchecked {
            ++validatorAuthCacheVersion;
        }
        emit ValidatorAuthCacheVersionBumped(validatorAuthCacheVersion);
    }

    /// @notice Batch update core validation parameters.
    /// @param committeeSize Number of validators selected per job.
    /// @param commitDur Duration of the commit phase in seconds.
    /// @param revealDur Duration of the reveal phase in seconds.
    /// @param approvalPct Percentage of stake required for approval.
    /// @param slashPct Percentage of stake slashed for incorrect votes.
    function setParameters(
        uint256 committeeSize,
        uint256 commitDur,
        uint256 revealDur,
        uint256 approvalPct,
        uint256 slashPct
    ) external override onlyOwner {
        setParameters(committeeSize, commitDur, revealDur);
        if (approvalPct == 0 || approvalPct > 100) revert InvalidApprovalThreshold();
        if (slashPct > 100) revert InvalidSlashingPercentage();
        approvalThreshold = approvalPct;
        validatorSlashingPercentage = slashPct;
        emit ApprovalThresholdUpdated(approvalPct);
        emit ValidatorSlashingPctUpdated(slashPct);
        emit ParametersUpdated(
            committeeSize,
            commitDur,
            revealDur,
            approvalPct,
            slashPct
        );
    }

    /// @notice Update validator count and phase windows.
    /// @param validatorCount Number of validators per job.
    /// @param commitDur Duration of the commit phase in seconds.
    /// @param revealDur Duration of the reveal phase in seconds.
    function setParameters(
        uint256 validatorCount,
        uint256 commitDur,
        uint256 revealDur
    ) public onlyOwner {
        if (validatorCount < 3 || validatorCount > maxValidatorsPerJob)
            revert InvalidValidatorBounds();
        if (commitDur == 0 || revealDur == 0) revert InvalidWindows();
        validatorsPerJob = validatorCount;
        minValidators = validatorCount;
        maxValidators = validatorCount;
        commitWindow = commitDur;
        revealWindow = revealDur;
        _syncRequiredValidatorApprovals();
        emit ValidatorBoundsUpdated(validatorCount, validatorCount);
        emit ValidatorsPerJobUpdated(validatorCount);
        emit TimingUpdated(commitDur, revealDur);
    }

    /// @notice Return validators selected for a job
    /// @param jobId Identifier of the job
    /// @return validators_ Array of validator addresses
    function validators(uint256 jobId) external view override returns (address[] memory validators_) {
        Round storage r = rounds[jobId];
        validators_ = r.tallied ? r.participants : r.validators;
    }

    /// @notice Retrieve the reveal deadline for a job
    /// @param jobId Identifier of the job
    /// @return deadline Timestamp when the reveal phase ends
    function revealDeadline(uint256 jobId) external view returns (uint256 deadline) {
        deadline = rounds[jobId].revealDeadline;
    }

    /// @notice Map validators to their ENS subdomains for selection-time checks.
    /// @param accounts Validator addresses to configure.
    /// @param subdomains ENS labels owned by each validator.
    function setValidatorSubdomains(
        address[] calldata accounts,
        string[] calldata subdomains
    ) external onlyOwner {
        if (accounts.length != subdomains.length) revert InvalidArrayLength();
        for (uint256 i; i < accounts.length;) {
            validatorSubdomains[accounts[i]] = subdomains[i];
            emit ValidatorSubdomainUpdated(accounts[i], subdomains[i]);
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Map the caller to an ENS subdomain for selection checks.
    /// @param subdomain ENS label owned by the caller.
    function setMySubdomain(string calldata subdomain) external {
        validatorSubdomains[msg.sender] = subdomain;
        emit ValidatorSubdomainUpdated(msg.sender, subdomain);
    }

    /// @notice Update the commit and reveal windows.
    function setCommitRevealWindows(uint256 commitDur, uint256 revealDur)
        external
        override
        onlyOwner
    {
        if (commitDur == 0 || revealDur == 0) revert InvalidWindows();
        commitWindow = commitDur;
        revealWindow = revealDur;
        emit TimingUpdated(commitDur, revealDur);
        emit CommitWindowUpdated(commitDur);
        emit RevealWindowUpdated(revealDur);
    }

    /// @notice Convenience wrapper matching original API naming.
    /// @dev Alias for {setCommitRevealWindows}.
    function setTiming(uint256 commitDur, uint256 revealDur)
        external
        onlyOwner
    {
        if (commitDur == 0 || revealDur == 0) revert InvalidWindows();
        commitWindow = commitDur;
        revealWindow = revealDur;
        emit TimingUpdated(commitDur, revealDur);
        emit CommitWindowUpdated(commitDur);
        emit RevealWindowUpdated(revealDur);
    }

    /// @notice Set minimum and maximum validators per round.
    function setValidatorBounds(uint256 minVals, uint256 maxVals) external override onlyOwner {
        if (minVals < 3 || maxVals < minVals || maxVals > maxValidatorsPerJob)
            revert InvalidValidatorBounds();
        minValidators = minVals;
        maxValidators = maxVals;
        if (minVals == maxVals) {
            validatorsPerJob = minVals;
            emit ValidatorsPerJobUpdated(minVals);
        } else if (validatorsPerJob < minVals) {
            validatorsPerJob = minVals;
            emit ValidatorsPerJobUpdated(minVals);
        } else if (validatorsPerJob > maxVals) {
            validatorsPerJob = maxVals;
            emit ValidatorsPerJobUpdated(maxVals);
        }
        _syncRequiredValidatorApprovals();
        emit ValidatorBoundsUpdated(minVals, maxVals);
    }

    /// @notice Set number of validators selected per job.
    function setValidatorsPerJob(uint256 count) external override onlyOwner {
        if (
            count < 3 ||
            count < minValidators ||
            count > maxValidators ||
            count > maxValidatorsPerJob
        ) revert InvalidValidatorBounds();
        validatorsPerJob = count;
        _syncRequiredValidatorApprovals();
        emit ValidatorsPerJobUpdated(count);
    }

    /// @dev Clamp required approvals to current committee size.
    function _clampRequiredValidatorApprovals() internal {
        if (requiredValidatorApprovals > validatorsPerJob) {
            requiredValidatorApprovals = validatorsPerJob;
            emit RequiredValidatorApprovalsUpdated(validatorsPerJob);
        }
    }

    function _approvalTarget(uint256 committee, uint256 pct)
        internal
        pure
        returns (uint256)
    {
        if (committee == 0 || pct == 0) {
            return 0;
        }
        uint256 numerator = committee * pct;
        uint256 target = numerator / 100;
        if (numerator % 100 != 0) {
            unchecked {
                ++target;
            }
        }
        return target;
    }

    function _syncRequiredValidatorApprovals() internal {
        if (autoApprovalTarget) {
            uint256 target = _approvalTarget(validatorsPerJob, approvalThreshold);
            if (requiredValidatorApprovals != target) {
                requiredValidatorApprovals = target;
                emit RequiredValidatorApprovalsUpdated(target);
            }
        } else {
            _clampRequiredValidatorApprovals();
        }
    }

    /// @notice Individually update commit window duration.
    function setCommitWindow(uint256 commitDur) external onlyOwner {
        if (commitDur == 0) revert InvalidCommitWindow();
        commitWindow = commitDur;
        emit TimingUpdated(commitDur, revealWindow);
        emit CommitWindowUpdated(commitDur);
    }

    /// @notice Individually update reveal window duration.
    function setRevealWindow(uint256 revealDur) external onlyOwner {
        if (revealDur == 0) revert InvalidRevealWindow();
        revealWindow = revealDur;
        emit TimingUpdated(commitWindow, revealDur);
        emit RevealWindowUpdated(revealDur);
    }

    /// @notice Individually update minimum validators.
    function setMinValidators(uint256 minVals) external onlyOwner {
        if (minVals == 0 || minVals > maxValidators) revert InvalidValidatorBounds();
        minValidators = minVals;
        emit ValidatorBoundsUpdated(minVals, maxValidators);
    }

    /// @notice Individually update maximum validators.
    function setMaxValidators(uint256 maxVals) external onlyOwner {
        if (maxVals < minValidators || maxVals == 0) revert InvalidValidatorBounds();
        maxValidators = maxVals;
        emit ValidatorBoundsUpdated(minValidators, maxVals);
    }

    function setValidatorSlashingPct(uint256 pct) external onlyOwner {
        if (pct > 100) revert InvalidPercentage();
        validatorSlashingPercentage = pct;
        emit ValidatorSlashingPctUpdated(pct);
    }

    /// @notice Update approval threshold percentage.
    function setApprovalThreshold(uint256 pct) external onlyOwner {
        if (pct == 0 || pct > 100) revert InvalidPercentage();
        approvalThreshold = pct;
        emit ApprovalThresholdUpdated(pct);
        _syncRequiredValidatorApprovals();
    }

    /// @notice Set the required number of validator approvals.
    function setRequiredValidatorApprovals(uint256 count) external override onlyOwner {
        if (count == 0 || count > maxValidators) revert InvalidApprovals();
        if (count > validatorsPerJob) count = validatorsPerJob;
        if (autoApprovalTarget) {
            autoApprovalTarget = false;
            emit AutoApprovalTargetUpdated(false);
        }
        requiredValidatorApprovals = count;
        emit RequiredValidatorApprovalsUpdated(count);
    }

    /// @notice Toggle automatic supermajority targeting for required approvals.
    /// @param enabled When true, the approval count tracks the configured threshold.
    function setAutoApprovalTarget(bool enabled) external override onlyOwner {
        if (autoApprovalTarget == enabled) {
            return;
        }
        autoApprovalTarget = enabled;
        emit AutoApprovalTargetUpdated(enabled);
        if (enabled) {
            _syncRequiredValidatorApprovals();
        } else {
            _clampRequiredValidatorApprovals();
        }
    }

    /// @inheritdoc IValidationModule
    /// @dev Randomness draws from aggregated caller-provided entropy and on-chain data.
    ///      Callers may submit additional entropy prior to finalization; each
    ///      contribution is XORed into an entropy pool. The pool is then mixed with
    ///      a future blockhash and `block.prevrandao` (or historical hashes and
    ///      `msg.sender` as fallback) to avoid external randomness providers and
    ///      minimize miner influence.
    function selectValidators(uint256 jobId, uint256 entropy)
        public
        override
        whenNotPaused
        returns (address[] memory selected)
    {
        Round storage r = rounds[jobId];
        IJobRegistry registry = jobRegistry;
        address registryAddr = address(registry);
        if (registryAddr != address(0)) {
            (bool burnRequired, bool burnSatisfied) = registry
                .burnEvidenceStatus(jobId);
            if (burnRequired && !burnSatisfied) revert BurnEvidenceIncomplete();
        }
        // Ensure validators are only chosen once per round to prevent
        // re-selection or commit replay.
        if (r.validators.length != 0) revert ValidatorsAlreadySelected();
        // Identity registry must be configured so candidates can be
        // verified on-chain via ENS ownership.
        if (address(identityRegistry) == address(0)) revert ZeroIdentityRegistry();

        // Reset any failover history when starting a fresh round.
        if (selectionBlock[jobId] == 0 && r.commitDeadline == 0) {
            delete failoverStates[jobId];
        }
        // If selection has not been initiated, seed the entropy pool and set the
        // target block whose hash will anchor the final randomness.
        if (selectionBlock[jobId] == 0) {
            pendingEntropy[jobId] = uint256(
                keccak256(abi.encodePacked(msg.sender, entropy))
            );
            selectionBlock[jobId] = block.number + 1;
            entropyRound[jobId] += 1;
            entropyContributorCount[jobId] = 1;
            entropyContributed[jobId][entropyRound[jobId]][msg.sender] = true;
            return selected;
        }

        // Before the target block is mined, allow additional parties to
        // contribute entropy. Each contribution is mixed into the pool via XOR.
        uint256 round = entropyRound[jobId];
        uint256 targetBlock = selectionBlock[jobId];

        if (block.number <= targetBlock) {
            pendingEntropy[jobId] ^= uint256(
                keccak256(abi.encodePacked(msg.sender, entropy))
            );
            if (!entropyContributed[jobId][round][msg.sender]) {
                entropyContributed[jobId][round][msg.sender] = true;
                unchecked {
                    entropyContributorCount[jobId] += 1;
                }
            }
            return selected;
        }

        // Finalization path using the stored entropy and future blockhash.
        if (
            entropyContributorCount[jobId] < MIN_ENTROPY_CONTRIBUTORS &&
            !entropyContributed[jobId][round][msg.sender]
        ) {
            pendingEntropy[jobId] ^= uint256(
                keccak256(abi.encodePacked(msg.sender, entropy))
            );
            entropyContributed[jobId][round][msg.sender] = true;
            unchecked {
                entropyContributorCount[jobId] += 1;
            }
        }
        if (entropyContributorCount[jobId] < MIN_ENTROPY_CONTRIBUTORS) {
            round += 1;
            entropyRound[jobId] = round;
            pendingEntropy[jobId] = uint256(
                keccak256(abi.encodePacked(msg.sender, entropy))
            );
            entropyContributorCount[jobId] = 1;
            entropyContributed[jobId][round][msg.sender] = true;
            selectionBlock[jobId] = block.number + 1;
            emit SelectionReset(jobId);
            return selected;
        }
        bytes32 bhash = blockhash(targetBlock);
        if (bhash == bytes32(0)) {
            round += 1;
            entropyRound[jobId] = round;
            pendingEntropy[jobId] = uint256(
                keccak256(abi.encodePacked(msg.sender, entropy))
            );
            entropyContributorCount[jobId] = 1;
            entropyContributed[jobId][round][msg.sender] = true;
            selectionBlock[jobId] = block.number + 1;
            emit SelectionReset(jobId);
            return selected;
        }

        uint256 randaoValue = uint256(block.prevrandao);
        if (randaoValue == 0) {
            randaoValue = uint256(
                keccak256(
                    abi.encodePacked(
                        blockhash(block.number - 1),
                        blockhash(block.number - 2),
                        msg.sender
                    )
                )
            );
        }

        unchecked {
            jobNonce[jobId] += 1;
        }

        uint256 rcRand;
        if (address(randaoCoordinator) != address(0)) {
            // RandaoCoordinator.random already mixes its seed with `block.prevrandao`
            rcRand = randaoCoordinator.random(bytes32(jobId));
        }

        bytes32 seed = keccak256(
            abi.encode(
                jobId,
                jobNonce[jobId],
                pendingEntropy[jobId],
                randaoValue,
                bhash,
                address(this),
                rcRand
            )
        );
        selectionSeeds[jobId] = seed;
        emit SelectionSeedRecorded(jobId, seed);
        uint256 randomSeed = uint256(seed);

        uint256 n = validatorPool.length;
        if (n == 0) revert InsufficientValidators();
        if (n > maxValidatorPoolSize) revert PoolLimitExceeded();
        if (address(stakeManager) == address(0)) revert StakeManagerNotSet();

        uint256 sample = validatorPoolSampleSize;
        if (sample > n) sample = n;

        uint256 size = r.committeeSize;
        if (size == 0) {
            size = validatorsPerJob;
            r.committeeSize = size;
        }
        if (size > maxValidatorsPerJob) size = maxValidatorsPerJob;
        if (sample < size) revert SampleSizeTooSmall();

        selected = new address[](size);
        uint256[] memory stakes = new uint256[](size);

        address[] memory candidates = new address[](sample);
        uint256[] memory candidateStakes = new uint256[](sample);
        uint256 candidateCount;
        uint256 totalStake;

        if (selectionStrategy == IValidationModule.SelectionStrategy.Rotating) {
            uint256 rotationStart = validatorPoolRotation;
            uint256 offset = uint256(
                keccak256(abi.encodePacked(randaoValue, bhash))
            ) % n;
            rotationStart = (rotationStart + offset) % n;
            uint256 i;
            for (; i < n && candidateCount < sample;) {
                uint256 idx = (rotationStart + i) % n;
                address candidate = validatorPool[idx];

                if (validatorBanUntil[candidate] > block.number) {
                    unchecked {
                        ++i;
                    }
                    continue;
                }

                uint256 stake = stakeManager.stakeOf(
                    candidate,
                    IStakeManager.Role.Validator
                );
                if (stake == 0) {
                    unchecked {
                        ++i;
                    }
                    continue;
                }

                if (address(reputationEngine) != address(0)) {
                    if (reputationEngine.isBlacklisted(candidate)) {
                        unchecked {
                            ++i;
                        }
                        continue;
                    }
                }

                bool authorized =
                    validatorAuthCache[candidate] &&
                    validatorAuthVersion[candidate] ==
                    validatorAuthCacheVersion &&
                    validatorAuthExpiry[candidate] > block.timestamp;
                if (!authorized) {
                    string memory subdomain = validatorSubdomains[candidate];
                    bool skipVerification;
                    if (bytes(subdomain).length == 0) {
                        if (!identityRegistry.additionalValidators(candidate)) {
                            unchecked {
                                ++i;
                            }
                            continue;
                        }
                        authorized = true;
                        skipVerification = true;
                    }
                    if (!skipVerification) {
                        bytes32[] memory proof;
                        (authorized, , , ) = identityRegistry.verifyValidator(
                            candidate,
                            subdomain,
                            proof
                        );
                    }
                    if (authorized) {
                        validatorAuthCache[candidate] = true;
                        validatorAuthExpiry[candidate] =
                            block.timestamp + validatorAuthCacheDuration;
                        validatorAuthVersion[candidate] =
                            validatorAuthCacheVersion;
                    }
                }
                if (!authorized) {
                    unchecked {
                        ++i;
                    }
                    continue;
                }

                candidates[candidateCount] = candidate;
                candidateStakes[candidateCount] = stake;
                totalStake += stake;
                unchecked {
                    ++candidateCount;
                    ++i;
                }
            }
            validatorPoolRotation = (rotationStart + i) % n;
            emit ValidatorPoolRotationUpdated(validatorPoolRotation);
        } else {
            uint256 eligible;
            for (uint256 i; i < n;) {
                address candidate = validatorPool[i];

                if (validatorBanUntil[candidate] > block.number) {
                    unchecked {
                        ++i;
                    }
                    continue;
                }

                uint256 stake = stakeManager.stakeOf(
                    candidate,
                    IStakeManager.Role.Validator
                );
                if (stake == 0) {
                    unchecked {
                        ++i;
                    }
                    continue;
                }

                if (address(reputationEngine) != address(0)) {
                    if (reputationEngine.isBlacklisted(candidate)) {
                        unchecked {
                            ++i;
                        }
                        continue;
                    }
                }

                bool authorized =
                    validatorAuthCache[candidate] &&
                    validatorAuthVersion[candidate] ==
                    validatorAuthCacheVersion &&
                    validatorAuthExpiry[candidate] > block.timestamp;
                if (!authorized) {
                    string memory subdomain = validatorSubdomains[candidate];
                    bool skipVerification;
                    if (bytes(subdomain).length == 0) {
                        if (!identityRegistry.additionalValidators(candidate)) {
                            unchecked {
                                ++i;
                            }
                            continue;
                        }
                        authorized = true;
                        skipVerification = true;
                    }
                    if (!skipVerification) {
                        bytes32[] memory proof;
                        (authorized, , , ) = identityRegistry.verifyValidator(
                            candidate,
                            subdomain,
                            proof
                        );
                    }
                    if (authorized) {
                        validatorAuthCache[candidate] = true;
                        validatorAuthExpiry[candidate] =
                            block.timestamp + validatorAuthCacheDuration;
                        validatorAuthVersion[candidate] =
                            validatorAuthCacheVersion;
                    }
                }
                if (!authorized) {
                    unchecked {
                        ++i;
                    }
                    continue;
                }

                unchecked {
                    ++eligible;
                }

                if (candidateCount < sample) {
                    candidates[candidateCount] = candidate;
                    candidateStakes[candidateCount] = stake;
                    totalStake += stake;
                    unchecked {
                        ++candidateCount;
                    }
                } else {
                    randomSeed = uint256(keccak256(abi.encode(randomSeed, i)));
                    uint256 j = randomSeed % eligible;
                    if (j < sample) {
                        totalStake =
                            totalStake - candidateStakes[j] + stake;
                        candidates[j] = candidate;
                        candidateStakes[j] = stake;
                    }
                }

                unchecked {
                    ++i;
                }
            }
        }

        if (candidateCount < size) revert InsufficientValidators();

        for (uint256 i; i < size;) {
            randomSeed = uint256(keccak256(abi.encode(randomSeed, i)));
            uint256 pick = randomSeed % totalStake;
            uint256 cumulative;
            uint256 chosen;
            for (uint256 j; j < candidateCount;) {
                cumulative += candidateStakes[j];
                if (pick < cumulative) {
                    chosen = j;
                    break;
                }
                unchecked {
                    ++j;
                }
            }

            address val = candidates[chosen];
            selected[i] = val;
            stakes[i] = candidateStakes[chosen];

            totalStake -= candidateStakes[chosen];
            candidateCount -= 1;
            candidates[chosen] = candidates[candidateCount];
            candidateStakes[chosen] = candidateStakes[candidateCount];

            unchecked {
                ++i;
            }
        }

        for (uint256 i; i < size;) {
            address val = selected[i];
            uint256 stakeAmount = stakes[i];
            validatorStakes[jobId][val] = stakeAmount;
            validatorStakeLocks[jobId][val] = stakeAmount;
            _validatorLookup[jobId][val] = true;
            unchecked {
                ++i;
            }
        }

        r.validators = selected;
        r.commitDeadline = block.timestamp + commitWindow;
        r.revealDeadline = r.commitDeadline + revealWindow;

        uint256 lockDuration = commitWindow + revealWindow + forceFinalizeGrace;
        if (lockDuration > type(uint64).max) revert InvalidWindows();
        uint64 lockTime = uint64(lockDuration);

        for (uint256 i; i < size;) {
            address val = selected[i];
            uint256 stakeAmount = validatorStakeLocks[jobId][val];
            stakeManager.lockValidatorStake(jobId, val, stakeAmount, lockTime);
            unchecked {
                ++i;
            }
        }

        // Clear stored entropy and target block after finalization.
        delete pendingEntropy[jobId];
        delete selectionBlock[jobId];

        emit ValidatorsSelected(jobId, selected);
        return selected;
    }

    /// @inheritdoc IValidationModule
    function start(
        uint256 jobId,
        uint256 entropy
    ) external override whenNotPaused nonReentrant returns (address[] memory) {
        if (msg.sender != address(jobRegistry)) revert OnlyJobRegistry();
        IJobRegistry.Job memory jobSnapshot = jobRegistry.jobs(jobId);
        IJobRegistry.JobMetadata memory meta = jobRegistry.decodeJobMetadata(
            jobSnapshot.packedMetadata
        );
        if (meta.status != IJobRegistry.Status.Submitted) revert JobNotSubmitted();
        Round storage r = rounds[jobId];
        uint256 n = validatorPool.length;
        if (n < minValidators) revert ValidatorPoolTooSmall();
        uint256 size = validatorsPerJob;
        if (size < minValidators) size = minValidators;
        if (size > maxValidators) size = maxValidators;
        if (size > maxValidatorsPerJob) size = maxValidatorsPerJob;
        if (size > n) size = n;
        r.committeeSize = size;

        // Initialize entropy and schedule finalization using a future blockhash.
        uint256 round = ++entropyRound[jobId];
        pendingEntropy[jobId] = uint256(
            keccak256(abi.encodePacked(msg.sender, entropy))
        );
        entropyContributorCount[jobId] = 1;
        entropyContributed[jobId][round][msg.sender] = true;
        selectionBlock[jobId] = block.number + 1;

        return new address[](0);
    }

    /// @notice Internal commit logic shared by overloads.
    function _commitValidation(
        uint256 jobId,
        bytes32 commitHash,
        string memory subdomain,
        bytes32[] memory proof
    ) internal whenNotPaused {
        Round storage r = rounds[jobId];
        IJobRegistry.Job memory jobSnapshot = jobRegistry.jobs(jobId);
        IJobRegistry.JobMetadata memory meta = jobRegistry.decodeJobMetadata(
            jobSnapshot.packedMetadata
        );
        if (meta.status != IJobRegistry.Status.Submitted) revert JobNotSubmitted();
        if (r.commitDeadline == 0 || block.timestamp > r.commitDeadline)
            revert CommitPhaseClosed();
        if (validatorBanUntil[msg.sender] > block.number) revert ValidatorBanned();
        if (address(reputationEngine) != address(0)) {
            if (reputationEngine.isBlacklisted(msg.sender))
                revert BlacklistedValidator();
        }
        if (address(identityRegistry) == address(0)) revert ZeroIdentityRegistry();
        if (!_isValidator(jobId, msg.sender)) revert NotValidator();
        (bool authorized, bytes32 node, bool viaWrapper, bool viaMerkle) =
            identityRegistry.verifyValidator(
                msg.sender,
                subdomain,
                proof
            );
        if (!authorized) revert UnauthorizedValidator();
        emit ValidatorIdentityVerified(
            msg.sender,
            node,
            subdomain,
            viaWrapper,
            viaMerkle
        );
        validatorAuthCache[msg.sender] = true;
        validatorAuthVersion[msg.sender] = validatorAuthCacheVersion;
        validatorAuthExpiry[msg.sender] =
            block.timestamp + validatorAuthCacheDuration;
        if (validatorStakes[jobId][msg.sender] == 0) revert NoStake();
        uint256 nonce = jobNonce[jobId];
        if (commitments[jobId][msg.sender][nonce] != bytes32(0))
            revert AlreadyCommitted();

        commitments[jobId][msg.sender][nonce] = commitHash;
        emit ValidationCommitted(jobId, msg.sender, commitHash, subdomain);
    }

    function _policy() internal view returns (ITaxPolicy) {
        address registry = address(jobRegistry);
        if (registry == address(0)) revert InvalidJobRegistry();
        return IJobRegistryTax(registry).taxPolicy();
    }

    /// @notice Commit a validation hash for a job.
    function commitValidation(
        uint256 jobId,
        bytes32 commitHash,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        public
        whenNotPaused
        override
        nonReentrant
        requiresTaxAcknowledgement(
            _policy(),
            msg.sender,
            owner(),
            address(0),
            address(0)
        )
    {
        _commitValidation(jobId, commitHash, subdomain, proof);
    }


    /// @notice Internal reveal logic shared by overloads.
    function _revealValidation(
        uint256 jobId,
        bool approve,
        bytes32 burnTxHash,
        bytes32 salt,
        string memory subdomain,
        bytes32[] memory proof
    ) internal whenNotPaused {
        Round storage r = rounds[jobId];
        if (block.timestamp <= r.commitDeadline) revert CommitPhaseActive();
        if (block.timestamp > r.revealDeadline) revert RevealPhaseClosed();
        if (!_isValidator(jobId, msg.sender)) revert NotValidator();
        if (validatorBanUntil[msg.sender] > block.number) revert ValidatorBanned();
        if (address(reputationEngine) != address(0)) {
            if (reputationEngine.isBlacklisted(msg.sender))
                revert BlacklistedValidator();
        }
        if (address(identityRegistry) == address(0)) revert ZeroIdentityRegistry();
        (bool authorized, bytes32 node, bool viaWrapper, bool viaMerkle) =
            identityRegistry.verifyValidator(
                msg.sender,
                subdomain,
                proof
            );
        if (!authorized) revert UnauthorizedValidator();
        emit ValidatorIdentityVerified(
            msg.sender,
            node,
            subdomain,
            viaWrapper,
            viaMerkle
        );
        validatorAuthCache[msg.sender] = true;
        validatorAuthVersion[msg.sender] = validatorAuthCacheVersion;
        validatorAuthExpiry[msg.sender] =
            block.timestamp + validatorAuthCacheDuration;
        uint256 nonce = jobNonce[jobId];
        bytes32 commitHash = commitments[jobId][msg.sender][nonce];
        if (commitHash == bytes32(0)) revert CommitMissing();
        if (revealed[jobId][msg.sender]) revert AlreadyRevealed();
        IJobRegistry registry = jobRegistry;
        address registryAddr = address(registry);
        if (registryAddr == address(0)) revert InvalidJobRegistry();
        (bool burnRequired, bool burnSatisfied) = registry.burnEvidenceStatus(
            jobId
        );
        if (burnRequired) {
            if (burnSatisfied) {
                if (burnTxHash == bytes32(0)) revert InvalidBurnReceipt();
                if (!registry.hasBurnReceipt(jobId, burnTxHash))
                    revert InvalidBurnReceipt();
            } else if (burnTxHash != bytes32(0)) {
                if (!registry.hasBurnReceipt(jobId, burnTxHash))
                    revert InvalidBurnReceipt();
            }
        } else if (burnTxHash != bytes32(0)) {
            if (!registry.hasBurnReceipt(jobId, burnTxHash))
                revert InvalidBurnReceipt();
        }
        bytes32 specHash = registry.getSpecHash(jobId);
        bytes32 outcomeHash = keccak256(
            abi.encode(nonce, specHash, approve, burnTxHash)
        );
        bytes32 expected = keccak256(
            abi.encode(
                jobId,
                outcomeHash,
                salt,
                msg.sender,
                block.chainid,
                DOMAIN_SEPARATOR
            )
        );
        if (commitHash != expected) {
            bytes32 legacy = keccak256(
                abi.encodePacked(
                    jobId,
                    nonce,
                    approve,
                    burnTxHash,
                    salt,
                    specHash
                )
            );
            if (commitHash != legacy) revert InvalidReveal();
        }

        uint256 stake = validatorStakes[jobId][msg.sender];
        if (stake == 0) revert NoStake();
        revealed[jobId][msg.sender] = true;
        votes[jobId][msg.sender] = approve;
        r.participants.push(msg.sender);
        r.revealedCount += 1;
        if (approve) r.approvals += stake; else r.rejections += stake;
        uint256 committee = r.committeeSize == 0
            ? validatorsPerJob
            : r.committeeSize;
        if (committee > maxValidatorsPerJob) committee = maxValidatorsPerJob;
        uint256 quorumTarget = _quorumTarget(committee);
        if (
            quorumTarget > 0 &&
            r.earlyFinalizeEligibleAt == 0 &&
            r.revealedCount >= quorumTarget
        ) {
            r.earlyFinalizeEligibleAt = uint64(
                block.timestamp + earlyFinalizeDelay
            );
        }

        emit ValidationRevealed(jobId, msg.sender, approve, burnTxHash, subdomain);
    }

    /// @notice Reveal a previously committed validation vote.
    function revealValidation(
        uint256 jobId,
        bool approve,
        bytes32 burnTxHash,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        public
        whenNotPaused
        override
        nonReentrant
        requiresTaxAcknowledgement(
            _policy(),
            msg.sender,
            owner(),
            address(0),
            address(0)
        )
    {
        _revealValidation(jobId, approve, burnTxHash, salt, subdomain, proof);
    }


    /// @notice Backwards-compatible wrapper for commitValidation.
    function commitVote(
        uint256 jobId,
        bytes32 commitHash,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        external
        whenNotPaused
        nonReentrant
        requiresTaxAcknowledgement(
            _policy(),
            msg.sender,
            owner(),
            address(0),
            address(0)
        )
    {
        commitValidation(jobId, commitHash, subdomain, proof);
    }

    /// @notice Backwards-compatible wrapper for revealValidation.
    function revealVote(
        uint256 jobId,
        bool approve,
        bytes32 burnTxHash,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        external
        whenNotPaused
        nonReentrant
        requiresTaxAcknowledgement(
            _policy(),
            msg.sender,
            owner(),
            address(0),
            address(0)
        )
    {
        revealValidation(jobId, approve, burnTxHash, salt, subdomain, proof);
    }

    /// @notice Tally revealed votes, apply slashing/rewards, and push result to JobRegistry.
    function finalize(uint256 jobId)
        external
        override
        whenNotPaused
        nonReentrant
        returns (bool success)
    {
        return _finalize(jobId);
    }

    function finalizeValidation(uint256 jobId)
        external
        override
        whenNotPaused
        nonReentrant
        returns (bool success)
    {
        return _finalize(jobId);
    }

    /// @notice Force finalize a job after the reveal deadline plus grace period.
    /// @dev If quorum was not met, no result is recorded and the employer/agent are refunded.
    /// @param jobId Identifier of the job
    /// @return success True if validators approved the job
    function forceFinalize(uint256 jobId)
        external
        override
        whenNotPaused
        nonReentrant
        returns (bool success)
    {
        Round storage r = rounds[jobId];
        if (r.tallied) revert AlreadyTallied();
        if (block.timestamp <= r.revealDeadline + forceFinalizeGrace)
            revert RevealPending();
        uint256 size = r.committeeSize == 0 ? validatorsPerJob : r.committeeSize;
        if (size > maxValidatorsPerJob) size = maxValidatorsPerJob;
        uint256 quorumTarget = _quorumTarget(size);
        if (quorumTarget == 0 || r.revealedCount >= quorumTarget) {
            return _finalize(jobId);
        }
        emit ValidationQuorumFailed(jobId, r.revealedCount, quorumTarget);
        r.earlyFinalizeEligibleAt = 0;

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        uint256 vlen = r.validators.length;
        if (vlen > maxValidatorsPerJob) vlen = maxValidatorsPerJob;
        (bool burnRequired, bool burnSatisfied) = jobRegistry
            .burnEvidenceStatus(jobId);
        bool skipPenalties = burnRequired && !burnSatisfied;
        for (uint256 i; i < vlen;) {
            address val = r.validators[i];
            if (!revealed[jobId][val] && !skipPenalties) {
                uint256 stake = validatorStakes[jobId][val];
                uint256 penalty = (stake * nonRevealPenaltyBps) / 10_000;
                if (penalty > 0) {
                    stakeManager.slash(
                        val,
                        IStakeManager.Role.Validator,
                        penalty,
                        job.employer
                    );
                    _reduceValidatorLock(jobId, val, penalty);
                }
                if (nonRevealBanBlocks != 0) {
                    uint256 untilBlock = block.number + nonRevealBanBlocks;
                    validatorBanUntil[val] = untilBlock;
                    emit ValidatorBanApplied(val, untilBlock);
                }
                if (address(reputationEngine) != address(0)) {
                    reputationEngine.subtract(val, 1);
                }
            }
            unchecked {
                ++i;
            }
        }
        r.tallied = true;
        emit ValidationTallied(jobId, false, r.approvals, r.rejections);
        emit ValidationResult(jobId, false);
        jobRegistry.forceFinalize(jobId);
        _cleanup(jobId);
        return false;
    }

    function _quorumTarget(uint256 committee) internal view returns (uint256) {
        if (committee == 0) {
            return 0;
        }
        uint256 pct = revealQuorumPct;
        uint256 pctCount;
        if (pct == 0) {
            pctCount = 0;
        } else {
            uint256 numerator = committee * pct;
            pctCount = numerator / 100;
            if (numerator % 100 != 0) {
                unchecked {
                    pctCount += 1;
                }
            }
        }
        uint256 minCount = minRevealValidators;
        if (minCount > committee) {
            minCount = committee;
        }
        if (pctCount < minCount) {
            return minCount;
        }
        return pctCount;
    }

    function _finalize(uint256 jobId) internal returns (bool success) {
        Round storage r = rounds[jobId];
        if (r.tallied) revert AlreadyTallied();
        bool earlyWindowReached =
            r.earlyFinalizeEligibleAt != 0 &&
            block.timestamp >= r.earlyFinalizeEligibleAt;
        if (r.revealedCount != r.validators.length) {
            if (!earlyWindowReached && block.timestamp <= r.revealDeadline)
                revert RevealPending();
        }

        uint256 total = r.approvals + r.rejections;
        uint256 size = r.committeeSize == 0
            ? validatorsPerJob
            : r.committeeSize;
        if (size > maxValidatorsPerJob) size = maxValidatorsPerJob;
        uint256 quorumTarget = _quorumTarget(size);
        bool quorum = quorumTarget == 0 || r.revealedCount >= quorumTarget;
        uint256 approvalCount;
        uint256 vlen = r.validators.length;
        if (vlen > maxValidatorsPerJob) vlen = maxValidatorsPerJob;
        for (uint256 i; i < vlen;) {
            address v = r.validators[i];
            if (revealed[jobId][v] && votes[jobId][v]) {
                unchecked { ++approvalCount; }
            }
            unchecked { ++i; }
        }
        if (!quorum && quorumTarget > 0) {
            emit ValidationQuorumFailed(jobId, r.revealedCount, quorumTarget);
        }
        if (quorum && total > 0) {
            bool thresholdMet =
                (r.approvals * 100) >= (total * approvalThreshold);
            bool countMet = approvalCount >= requiredValidatorApprovals;
            success = thresholdMet && countMet;
        } else {
            success = false;
        }
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        address[] memory committee = new address[](vlen);
        bool[] memory revealedStates = new bool[](vlen);
        bool[] memory voteStates = new bool[](vlen);
        for (uint256 i; i < vlen;) {
            address validator = r.validators[i];
            committee[i] = validator;
            revealedStates[i] = revealed[jobId][validator];
            voteStates[i] = votes[jobId][validator];
            unchecked {
                ++i;
            }
        }

        if (address(reputationEngine) != address(0)) {
            uint256 payout;
            uint256 duration;
            if (success) {
                IJobRegistry.JobMetadata memory metadata = jobRegistry.decodeJobMetadata(
                    job.packedMetadata
                );
                uint256 validatorPct = jobRegistry.validatorRewardPct();
                uint256 rewardAfterValidator = uint256(job.reward);
                if (committee.length > 0 && validatorPct > 0) {
                    uint256 validatorReward = (uint256(job.reward) * validatorPct) / 100;
                    rewardAfterValidator -= validatorReward;
                }
                uint256 agentPctRaw = metadata.agentPct;
                uint256 agentPct = agentPctRaw == 0 ? 100 : agentPctRaw;
                uint256 agentAmount = (rewardAfterValidator * agentPct) / 100;
                payout = agentAmount * 1e12;
                if (metadata.assignedAt != 0 && block.timestamp > metadata.assignedAt) {
                    duration = block.timestamp - uint256(metadata.assignedAt);
                }
            }

            reputationEngine.updateScores(
                jobId,
                job.agent,
                committee,
                success,
                revealedStates,
                voteStates,
                payout,
                duration
            );
            jobRegistry.markReputationProcessed(jobId);
        }

        for (uint256 i; i < vlen;) {
            address val = r.validators[i];
            uint256 stake = validatorStakes[jobId][val];
            uint256 slashAmount = (stake * validatorSlashingPercentage) / 100;
            if (!revealed[jobId][val]) {
                uint256 penalty = (stake * nonRevealPenaltyBps) / 10_000;
                if (penalty > 0) {
                    stakeManager.slash(
                        val,
                        IStakeManager.Role.Validator,
                        penalty,
                        job.employer
                    );
                    _reduceValidatorLock(jobId, val, penalty);
                }
                if (nonRevealBanBlocks != 0) {
                    uint256 untilBlock = block.number + nonRevealBanBlocks;
                    validatorBanUntil[val] = untilBlock;
                    emit ValidatorBanApplied(val, untilBlock);
                }
            } else if (votes[jobId][val] != success) {
                if (slashAmount > 0) {
                    stakeManager.slash(
                        val,
                        IStakeManager.Role.Validator,
                        slashAmount,
                        job.employer
                    );
                    _reduceValidatorLock(jobId, val, slashAmount);
                }
            }
            unchecked { ++i; }
        }

        r.tallied = true;
        emit ValidationTallied(jobId, success, r.approvals, r.rejections);
        emit ValidationResult(jobId, success);

        jobRegistry.onValidationResult(jobId, success, r.validators);
        _cleanup(jobId);
        return success;
    }

    function _reduceValidatorLock(uint256 jobId, address val, uint256 amount) internal {
        if (amount == 0) {
            return;
        }
        uint256 locked = validatorStakeLocks[jobId][val];
        if (locked == 0) {
            return;
        }
        if (amount >= locked) {
            validatorStakeLocks[jobId][val] = 0;
        } else {
            validatorStakeLocks[jobId][val] = locked - amount;
        }
    }

    function _cleanup(uint256 jobId) internal {
        uint256 nonce = jobNonce[jobId];
        Round storage r = rounds[jobId];
        address[] storage vals = r.validators;
        uint256 vlen = vals.length;
        if (vlen > maxValidatorsPerJob) vlen = maxValidatorsPerJob;
        for (uint256 i; i < vlen;) {
            address val = vals[i];
            delete commitments[jobId][val][nonce];
            delete revealed[jobId][val];
            delete votes[jobId][val];
            uint256 lockAmount = validatorStakeLocks[jobId][val];
            if (lockAmount != 0) {
                stakeManager.unlockValidatorStake(jobId, val, lockAmount);
            }
            delete validatorStakeLocks[jobId][val];
            delete validatorStakes[jobId][val];
            delete _validatorLookup[jobId][val];
            unchecked {
                ++i;
            }
        }
        r.revealedCount = 0;
        delete rounds[jobId];
        delete jobNonce[jobId];
        delete selectionSeeds[jobId];
    }

    /// @notice Reset the validation nonce for a job after finalization or dispute resolution.
    /// @param jobId Identifier of the job
    function resetJobNonce(uint256 jobId) external override {
        if (msg.sender != owner() && msg.sender != address(jobRegistry))
            revert UnauthorizedCaller();
        _cleanup(jobId);
        emit JobNonceReset(jobId);
    }

    /// @notice Reset pending entropy and selection block for a job to allow reselection.
    /// @param jobId Identifier of the job.
    function resetSelection(uint256 jobId) external onlyOwner {
        delete pendingEntropy[jobId];
        delete selectionBlock[jobId];
        emit SelectionReset(jobId);
    }

    /// @dev Check whether an address is a selected validator for a job.
    /// @param jobId Identifier of the job.
    /// @param val Validator address to check.
    /// @return True if the address is a validator for the job.
    function _isValidator(uint256 jobId, address val) internal view returns (bool) {
        return _validatorLookup[jobId][val];
    }

    /// @notice Confirms the contract and its owner can never accrue tax obligations.
    /// @return Always true to signal perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Prevent accidental ETH deposits; the module never holds funds.
    receive() external payable {
        revert("ValidationModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("ValidationModule: no ether");
    }
}

