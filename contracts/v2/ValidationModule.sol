// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IJobRegistryTax} from "./interfaces/IJobRegistryTax.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {ReputationEngine} from "./ReputationEngine.sol";
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
error AwaitBlockhash();
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
error AlreadyTallied();
error RevealPending();
error UnauthorizedCaller();

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

    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IIdentityRegistry public identityRegistry;
    IRandaoCoordinator public randaoCoordinator;
    address public pauser;

    // timing configuration
    uint256 public commitWindow;
    uint256 public revealWindow;

    // validator bounds per job
    uint256 public minValidators;
    uint256 public maxValidators;
    uint256 public validatorsPerJob;

    /// @notice Hard limit on the number of validators any single job may use.
    uint256 public maxValidatorsPerJob = 100;

    uint256 public constant DEFAULT_COMMIT_WINDOW = 1 days;
    uint256 public constant DEFAULT_REVEAL_WINDOW = 1 days;
    uint256 public constant DEFAULT_MIN_VALIDATORS = 3;
    uint256 public constant DEFAULT_MAX_VALIDATORS = 3;
    uint256 public constant FORCE_FINALIZE_GRACE = 1 hours;

    // slashing percentage applied to validator stake for incorrect votes
    uint256 public validatorSlashingPercentage = 50;
    // percentage of total stake required for approval
    uint256 public approvalThreshold = 50;
    // absolute number of validator approvals required
    uint256 public requiredValidatorApprovals;

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
    uint256 public validatorAuthCacheDuration = 1 days;

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
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => mapping(uint256 => bytes32))) public commitments;
    mapping(uint256 => mapping(address => bool)) public revealed;
    mapping(uint256 => mapping(address => bool)) public votes;
    mapping(uint256 => mapping(address => uint256)) public validatorStakes;
    mapping(uint256 => mapping(address => bool)) private _validatorLookup;
    mapping(uint256 => uint256) public jobNonce;
    // Aggregated entropy contributed by job parties prior to final selection.
    // Each call to `selectValidators` before the target block XORs a
    // caller-supplied value (mixed with the caller address) into this pool.
    mapping(uint256 => uint256) public pendingEntropy;
    // Block number whose hash will be used to finalize committee selection.
    mapping(uint256 => uint256) public selectionBlock;

    // Track unique entropy contributors for each job and round
    mapping(uint256 => uint256) public entropyContributorCount;
    mapping(uint256 => uint256) public entropyRound;
    mapping(uint256 => mapping(uint256 => mapping(address => bool)))
        private entropyContributed;
    uint256 public constant MIN_ENTROPY_CONTRIBUTORS = 2;

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
    event ValidatorAuthCacheVersionBumped(uint256 version);
    event SelectionReset(uint256 indexed jobId);
    event PauserUpdated(address indexed pauser);

    modifier onlyOwnerOrPauser() {
        require(
            msg.sender == owner() || msg.sender == pauser,
            "owner or pauser only"
        );
        _;
    }

    function setPauser(address _pauser) external onlyOwner {
        pauser = _pauser;
        emit PauserUpdated(_pauser);
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
        emit ValidatorBoundsUpdated(minValidators, maxValidators);
        validatorsPerJob = minValidators;
        emit ValidatorsPerJobUpdated(validatorsPerJob);

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
        _clampRequiredValidatorApprovals();
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
        _clampRequiredValidatorApprovals();
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
        _clampRequiredValidatorApprovals();
        emit ValidatorsPerJobUpdated(count);
    }

    /// @dev Clamp required approvals to current committee size.
    function _clampRequiredValidatorApprovals() internal {
        if (requiredValidatorApprovals > validatorsPerJob) {
            requiredValidatorApprovals = validatorsPerJob;
            emit RequiredValidatorApprovalsUpdated(validatorsPerJob);
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
    }

    /// @notice Set the required number of validator approvals.
    function setRequiredValidatorApprovals(uint256 count) external override onlyOwner {
        if (count == 0 || count > maxValidators) revert InvalidApprovals();
        if (count > validatorsPerJob) count = validatorsPerJob;
        requiredValidatorApprovals = count;
        emit RequiredValidatorApprovalsUpdated(count);
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
        // Ensure validators are only chosen once per round to prevent
        // re-selection or commit replay.
        if (r.validators.length != 0) revert ValidatorsAlreadySelected();
        // Identity registry must be configured so candidates can be
        // verified on-chain via ENS ownership.
        if (address(identityRegistry) == address(0)) revert ZeroIdentityRegistry();

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
        if (block.number <= selectionBlock[jobId]) {
            pendingEntropy[jobId] ^= uint256(
                keccak256(abi.encodePacked(msg.sender, entropy))
            );
            uint256 round = entropyRound[jobId];
            if (!entropyContributed[jobId][round][msg.sender]) {
                entropyContributed[jobId][round][msg.sender] = true;
                unchecked {
                    entropyContributorCount[jobId] += 1;
                }
            }
            return selected;
        }

        // Finalization path using the stored entropy and future blockhash.
        if (block.number <= selectionBlock[jobId]) revert AwaitBlockhash();
        uint256 round = entropyRound[jobId];
        if (!entropyContributed[jobId][round][msg.sender]) {
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
        bytes32 bhash = blockhash(selectionBlock[jobId]);
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

        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    jobId,
                    jobNonce[jobId],
                    pendingEntropy[jobId],
                    randaoValue,
                    bhash,
                    address(this),
                    rcRand
                )
            )
        );

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
                    bytes32[] memory proof;
                    (authorized, , , ) = identityRegistry.verifyValidator(
                        candidate,
                        subdomain,
                        proof
                    );
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
                    bytes32[] memory proof;
                    (authorized, , , ) = identityRegistry.verifyValidator(
                        candidate,
                        subdomain,
                        proof
                    );
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
                    seed = uint256(keccak256(abi.encodePacked(seed, i)));
                    uint256 j = seed % eligible;
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
            seed = uint256(keccak256(abi.encodePacked(seed, i)));
            uint256 pick = seed % totalStake;
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
            validatorStakes[jobId][val] = stakes[i];
            _validatorLookup[jobId][val] = true;
            unchecked {
                ++i;
            }
        }

        r.validators = selected;
        r.commitDeadline = block.timestamp + commitWindow;
        r.revealDeadline = r.commitDeadline + revealWindow;

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
    ) external override whenNotPaused nonReentrant returns (address[] memory selected) {
        if (msg.sender != address(jobRegistry)) revert OnlyJobRegistry();
        if (jobRegistry.jobs(jobId).status != IJobRegistry.Status.Submitted)
            revert JobNotSubmitted();
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
    }

    /// @notice Internal commit logic shared by overloads.
    function _commitValidation(
        uint256 jobId,
        bytes32 commitHash,
        string memory subdomain,
        bytes32[] memory proof
    ) internal whenNotPaused {
        Round storage r = rounds[jobId];
        if (jobRegistry.jobs(jobId).status != IJobRegistry.Status.Submitted)
            revert JobNotSubmitted();
        if (r.commitDeadline == 0 || block.timestamp > r.commitDeadline)
            revert CommitPhaseClosed();
        if (address(reputationEngine) != address(0)) {
            if (reputationEngine.isBlacklisted(msg.sender))
                revert BlacklistedValidator();
        }
        if (address(identityRegistry) == address(0)) revert ZeroIdentityRegistry();
        if (!_isValidator(jobId, msg.sender)) revert NotValidator();
        (bool authorized, , , ) = identityRegistry.verifyValidator(
            msg.sender,
            subdomain,
            proof
        );
        if (!authorized) revert UnauthorizedValidator();
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
        bytes32 salt,
        string memory subdomain,
        bytes32[] memory proof
    ) internal whenNotPaused {
        Round storage r = rounds[jobId];
        if (block.timestamp <= r.commitDeadline) revert CommitPhaseActive();
        if (block.timestamp > r.revealDeadline) revert RevealPhaseClosed();
        if (!_isValidator(jobId, msg.sender)) revert NotValidator();
        if (address(reputationEngine) != address(0)) {
            if (reputationEngine.isBlacklisted(msg.sender))
                revert BlacklistedValidator();
        }
        if (address(identityRegistry) == address(0)) revert ZeroIdentityRegistry();
        (bool authorized, , , ) = identityRegistry.verifyValidator(
            msg.sender,
            subdomain,
            proof
        );
        if (!authorized) revert UnauthorizedValidator();
        validatorAuthCache[msg.sender] = true;
        validatorAuthVersion[msg.sender] = validatorAuthCacheVersion;
        validatorAuthExpiry[msg.sender] =
            block.timestamp + validatorAuthCacheDuration;
        uint256 nonce = jobNonce[jobId];
        bytes32 commitHash = commitments[jobId][msg.sender][nonce];
        if (commitHash == bytes32(0)) revert CommitMissing();
        if (revealed[jobId][msg.sender]) revert AlreadyRevealed();
        bytes32 specHash = jobRegistry.getSpecHash(jobId);
        if (
            keccak256(
                abi.encodePacked(jobId, nonce, approve, salt, specHash)
            ) != commitHash
        ) revert InvalidReveal();

        uint256 stake = validatorStakes[jobId][msg.sender];
        if (stake == 0) revert NoStake();
        revealed[jobId][msg.sender] = true;
        votes[jobId][msg.sender] = approve;
        r.participants.push(msg.sender);
        r.revealedCount += 1;
        if (approve) r.approvals += stake; else r.rejections += stake;

        emit ValidationRevealed(jobId, msg.sender, approve, subdomain);
    }

    /// @notice Reveal a previously committed validation vote.
    function revealValidation(
        uint256 jobId,
        bool approve,
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
        _revealValidation(jobId, approve, salt, subdomain, proof);
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
        revealValidation(jobId, approve, salt, subdomain, proof);
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
        if (block.timestamp <= r.revealDeadline + FORCE_FINALIZE_GRACE)
            revert RevealPending();
        uint256 size = r.committeeSize == 0 ? validatorsPerJob : r.committeeSize;
        if (size > maxValidatorsPerJob) size = maxValidatorsPerJob;
        if (r.revealedCount >= size) {
            return _finalize(jobId);
        }
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        uint256 vlen = r.validators.length;
        if (vlen > maxValidatorsPerJob) vlen = maxValidatorsPerJob;
        for (uint256 i; i < vlen;) {
            address val = r.validators[i];
            if (!revealed[jobId][val]) {
                uint256 stake = validatorStakes[jobId][val];
                uint256 slashAmount = (stake * validatorSlashingPercentage) / 100;
                if (slashAmount > 0) {
                    stakeManager.slash(
                        val,
                        IStakeManager.Role.Validator,
                        slashAmount,
                        job.employer
                    );
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

    function _finalize(uint256 jobId) internal returns (bool success) {
        Round storage r = rounds[jobId];
        if (r.tallied) revert AlreadyTallied();
        if (r.revealedCount != r.validators.length) {
            if (block.timestamp <= r.revealDeadline) revert RevealPending();
        }

        uint256 total = r.approvals + r.rejections;
        uint256 size = r.committeeSize == 0
            ? validatorsPerJob
            : r.committeeSize;
        if (size > maxValidatorsPerJob) size = maxValidatorsPerJob;
        bool quorum = r.revealedCount >= size;
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
        if (quorum && total > 0) {
            bool thresholdMet =
                (r.approvals * 100) >= (total * approvalThreshold);
            bool countMet = approvalCount >= requiredValidatorApprovals;
            success = thresholdMet && countMet;
        } else {
            success = false;
        }
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        uint256 agentGain;
        if (address(reputationEngine) != address(0) && success) {
            uint256 payout = uint256(job.reward) * 1e12;
            // attempt to derive validator reward from reputation engine
            try
                ReputationEngine(payable(address(reputationEngine)))
                    .calculateReputationPoints(payout, 0)
            returns (uint256 points) {
                agentGain = points;
            } catch {
                agentGain = 1;
            }
        }

        for (uint256 i; i < vlen;) {
            address val = r.validators[i];
            uint256 stake = validatorStakes[jobId][val];
            uint256 slashAmount = (stake * validatorSlashingPercentage) / 100;
            if (!revealed[jobId][val] || votes[jobId][val] != success) {
                if (slashAmount > 0) {
                    stakeManager.slash(
                        val,
                        IStakeManager.Role.Validator,
                        slashAmount,
                        job.employer
                    );
                }
                if (address(reputationEngine) != address(0)) {
                    reputationEngine.subtract(val, 1);
                }
            } else if (address(reputationEngine) != address(0)) {
                reputationEngine.rewardValidator(val, agentGain);
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
            delete validatorStakes[jobId][val];
            delete _validatorLookup[jobId][val];
            unchecked {
                ++i;
            }
        }
        r.revealedCount = 0;
        delete rounds[jobId];
        delete jobNonce[jobId];
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

