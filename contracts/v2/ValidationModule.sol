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

import "./implementation/ValidationModuleBase.sol";
import "./implementation/FixedDelegate.sol";

/// @notice ValidationModule with immutable, separately deployed implementations.
contract ValidationModule is ValidationModuleBase, FixedDelegate {
    // Preserve delegated custom errors in the public controller ABI.
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

    address private immutable _configuration;
    address private immutable _voting;
    address private immutable _selection;

    /// @notice Require caller to acknowledge current tax policy via JobRegistry.

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        uint256 _commitWindow,
        uint256 _revealWindow,
        uint256 _minValidators,
        uint256 _maxValidators,
        address[] memory _validatorPool,
        address[3] memory implementations
    ) ValidationModuleBase() {
        _configuration = _checkedImplementation(implementations[0], keccak256("ValidationModuleConfiguration:v1"));
        _voting = _checkedImplementation(implementations[1], keccak256("ValidationModuleVoting:v1"));
        _selection = _checkedImplementation(implementations[2], keccak256("ValidationModuleSelection:v1"));

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("ValidationModule(string version,address verifyingContract,uint256 chainId)"),
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
        if (address(_jobRegistry) != address(0) || address(_stakeManager) != address(0)) {
            emit ModulesUpdated(address(_jobRegistry), address(_stakeManager));
        }
        commitWindow = _commitWindow == 0 ? DEFAULT_COMMIT_WINDOW : _commitWindow;
        revealWindow = _revealWindow == 0 ? DEFAULT_REVEAL_WINDOW : _revealWindow;
        emit TimingUpdated(commitWindow, revealWindow);

        minValidators = _minValidators == 0 ? DEFAULT_MIN_VALIDATORS : _minValidators;
        maxValidators = _maxValidators == 0 ? DEFAULT_MAX_VALIDATORS : _maxValidators;
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

    function implementationModules() external view returns (address[3] memory) {
        return [_configuration, _voting, _selection];
    }

    function setPauser(address _pauser) external override {
        _delegate(_configuration);
    }

    function setPauserManager(address manager) external override {
        _delegate(_configuration);
    }

    /// @notice Update non-reveal penalty parameters.
    /// @param penaltyBps Slash applied in basis points of validator stake.
    /// @param banBlocks Number of blocks a validator is banned from new committees.
    function setNonRevealPenalty(uint256 penaltyBps, uint256 banBlocks) external override {
        _delegate(_configuration);
    }

    /// @notice Update the reveal quorum requirements.
    /// @param pct Percentage of the committee that must reveal (0-100).
    /// @param minValidators_ Absolute minimum number of reveals required.
    function setRevealQuorum(uint256 pct, uint256 minValidators_) external override {
        _delegate(_configuration);
    }

    /// @notice Update the cool-off delay before early finalization is permitted.
    /// @param delay Seconds to wait after quorum is met before allowing finalize.
    function setEarlyFinalizeDelay(uint256 delay) external override {
        _delegate(_configuration);
    }

    /// @notice Update the grace period before force finalize can be triggered.
    /// @param grace Additional seconds allowed after the reveal window closes.
    function setForceFinalizeGrace(uint256 grace) external override {
        _delegate(_configuration);
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
    ) external override {
        _delegate(_voting);
    }

    /// @notice Update the list of eligible validators.
    /// @param newPool Addresses of validators.
    function setValidatorPool(address[] calldata newPool) external override {
        _delegate(_configuration);
    }

    /// @notice Update the reputation engine used for validator feedback.
    function setReputationEngine(IReputationEngine engine) external override {
        _delegate(_configuration);
    }

    /// @notice Update the JobRegistry reference.
    function setJobRegistry(IJobRegistry registry) external override {
        _delegate(_configuration);
    }

    /// @notice Update the StakeManager reference.
    function setStakeManager(IStakeManager manager) external override {
        _delegate(_configuration);
    }

    /// @notice Update the identity registry used for validator verification.
    function setIdentityRegistry(IIdentityRegistry registry) external override {
        _delegate(_configuration);
    }

    /// @notice Set the Randao coordinator used for randomness.
    /// @param coordinator Address of the RandaoCoordinator contract.
    function setRandaoCoordinator(IRandaoCoordinator coordinator) external override {
        _delegate(_configuration);
    }

    /// @notice Pause validation operations
    function pause() external override {
        _delegate(_configuration);
    }

    /// @notice Resume validation operations
    function unpause() external override {
        _delegate(_configuration);
    }

    /// @notice Update the maximum number of pool entries sampled during selection.
    /// @param size Maximum number of validators examined on-chain.
    function setValidatorPoolSampleSize(uint256 size) external override {
        _delegate(_configuration);
    }

    /// @notice Update the maximum allowable size of the validator pool.
    /// @param size Maximum number of validators permitted in the pool.
    function setMaxValidatorPoolSize(uint256 size) external override {
        _delegate(_configuration);
    }

    /// @notice Update the maximum number of validators allowed per job.
    /// @param max Maximum validators permitted for any job.
    function setMaxValidatorsPerJob(uint256 max) external override {
        _delegate(_configuration);
    }

    /// @notice Configure the validator sampling strategy.
    /// @param strategy Sampling algorithm to employ when selecting validators.
    function setSelectionStrategy(IValidationModule.SelectionStrategy strategy) external override {
        _delegate(_configuration);
    }

    /// @notice Update the duration for cached validator authorizations.
    /// @param duration Seconds an authorization remains valid in cache.
    function setValidatorAuthCacheDuration(uint256 duration) external override {
        _delegate(_configuration);
    }

    /// @notice Increment the validator authorization cache version,
    /// invalidating all existing cache entries.
    function bumpValidatorAuthCacheVersion() public override {
        _delegate(_configuration);
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
    ) external override {
        _delegate(_configuration);
    }

    /// @notice Update validator count and phase windows.
    /// @param validatorCount Number of validators per job.
    /// @param commitDur Duration of the commit phase in seconds.
    /// @param revealDur Duration of the reveal phase in seconds.
    function setParameters(uint256 validatorCount, uint256 commitDur, uint256 revealDur) public override {
        _delegate(_configuration);
    }

    /// @notice Map validators to their ENS subdomains for selection-time checks.
    /// @param accounts Validator addresses to configure.
    /// @param subdomains ENS labels owned by each validator.
    function setValidatorSubdomains(address[] calldata accounts, string[] calldata subdomains) external override {
        _delegate(_configuration);
    }

    /// @notice Map the caller to an ENS subdomain for selection checks.
    /// @param subdomain ENS label owned by the caller.
    function setMySubdomain(string calldata subdomain) external override {
        _delegate(_configuration);
    }

    /// @notice Update the commit and reveal windows.
    function setCommitRevealWindows(uint256 commitDur, uint256 revealDur) external override {
        _delegate(_configuration);
    }

    /// @notice Convenience wrapper matching original API naming.
    /// @dev Alias for {setCommitRevealWindows}.
    function setTiming(uint256 commitDur, uint256 revealDur) external override {
        _delegate(_configuration);
    }

    /// @notice Set minimum and maximum validators per round.
    function setValidatorBounds(uint256 minVals, uint256 maxVals) external override {
        _delegate(_configuration);
    }

    /// @notice Set number of validators selected per job.
    function setValidatorsPerJob(uint256 count) external override {
        _delegate(_configuration);
    }

    /// @notice Individually update commit window duration.
    function setCommitWindow(uint256 commitDur) external override {
        _delegate(_configuration);
    }

    /// @notice Individually update reveal window duration.
    function setRevealWindow(uint256 revealDur) external override {
        _delegate(_configuration);
    }

    /// @notice Individually update minimum validators.
    function setMinValidators(uint256 minVals) external override {
        _delegate(_configuration);
    }

    /// @notice Individually update maximum validators.
    function setMaxValidators(uint256 maxVals) external override {
        _delegate(_configuration);
    }

    function setValidatorSlashingPct(uint256 pct) external override {
        _delegate(_configuration);
    }

    /// @notice Update approval threshold percentage.
    function setApprovalThreshold(uint256 pct) external override {
        _delegate(_configuration);
    }

    /// @notice Set the required number of validator approvals.
    function setRequiredValidatorApprovals(uint256 count) external override {
        _delegate(_configuration);
    }

    /// @notice Toggle automatic supermajority targeting for required approvals.
    /// @param enabled When true, the approval count tracks the configured threshold.
    function setAutoApprovalTarget(bool enabled) external override {
        _delegate(_configuration);
    }

    /// @inheritdoc IValidationModule
    /// @dev Randomness draws from aggregated caller-provided entropy and on-chain data.
    ///      Callers may submit additional entropy prior to finalization; each
    ///      contribution is XORed into an entropy pool. The pool is then mixed with
    ///      a future blockhash and `block.prevrandao` (or historical hashes and
    ///      `msg.sender` as fallback) to avoid external randomness providers and
    ///      minimize miner influence.
    function selectValidators(uint256 jobId, uint256 entropy) public override returns (address[] memory selected) {
        _delegate(_selection);
    }

    /// @inheritdoc IValidationModule
    function start(uint256 jobId, uint256 entropy) external override returns (address[] memory) {
        _delegate(_selection);
    }

    /// @notice Commit a validation hash for a job.
    function commitValidation(uint256 jobId, bytes32 commitHash, string calldata subdomain, bytes32[] calldata proof)
        public
        override
    {
        _delegate(_voting);
    }

    /// @notice Reveal a previously committed validation vote.
    function revealValidation(
        uint256 jobId,
        bool approve,
        bytes32 burnTxHash,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public override {
        _delegate(_voting);
    }

    /// @notice Backwards-compatible wrapper for commitValidation.
    function commitVote(uint256 jobId, bytes32 commitHash, string calldata subdomain, bytes32[] calldata proof)
        external
        override
    {
        _delegate(_voting);
    }

    /// @notice Backwards-compatible wrapper for revealValidation.
    function revealVote(
        uint256 jobId,
        bool approve,
        bytes32 burnTxHash,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external override {
        _delegate(_voting);
    }

    /// @notice Tally revealed votes, apply slashing/rewards, and push result to JobRegistry.
    function finalize(uint256 jobId) external override returns (bool success) {
        _delegate(_voting);
    }

    function finalizeValidation(uint256 jobId) external override returns (bool success) {
        _delegate(_voting);
    }

    /// @notice Force finalize a job after the reveal deadline plus grace period.
    /// @dev If quorum was not met, no result is recorded and the employer/agent are refunded.
    /// @param jobId Identifier of the job
    /// @return success True if validators approved the job
    function forceFinalize(uint256 jobId) external override returns (bool success) {
        _delegate(_voting);
    }

    /// @notice Reset the validation nonce for a job after finalization or dispute resolution.
    /// @param jobId Identifier of the job
    function resetJobNonce(uint256 jobId) external override {
        _delegate(_selection);
    }

    /// @notice Reset pending entropy and selection block for a job to allow reselection.
    /// @param jobId Identifier of the job.
    function resetSelection(uint256 jobId) external override {
        _delegate(_selection);
    }
}
