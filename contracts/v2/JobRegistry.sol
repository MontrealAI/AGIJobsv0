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
import {IAuditModule} from "./interfaces/IAuditModule.sol";
import {TOKEN_SCALE} from "./Constants.sol";

import "./implementation/JobRegistryBase.sol";
import "./implementation/FixedDelegate.sol";

/// @notice JobRegistry with immutable, separately deployed implementations.
contract JobRegistry is JobRegistryBase, FixedDelegate {
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
    error InvalidAuditModule();
    error PolicyNotTaxExempt();
    error InvalidFeePool();
    error InvalidIdentityRegistry();
    error IdentityRegistryNotSet();
    error InvalidTaxPolicy();
    error InvalidTreasury();
    error InvalidAckModule();
    error NotGovernanceOrPauser();
    error NotGovernanceOrPauserManager();
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
    error InvalidEscalationState(uint8 state);
    error EmptySubdomain();

    address private immutable _configuration;
    address private immutable _lifecycle;
    address private immutable _settlement;

    constructor(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _disputeModule,
        ICertificateNFT _certNFT,
        IFeePool _feePool,
        ITaxPolicy _policy,
        uint256 _feePct,
        uint96 _jobStake,
        address[] memory _ackModules,
        address _timelock, // timelock or multisig controller
        address[3] memory implementations
    ) JobRegistryBase(_timelock) {
        _configuration = _checkedImplementation(implementations[0], keccak256("JobRegistryConfiguration:v1"));
        _lifecycle = _checkedImplementation(implementations[1], keccak256("JobRegistryLifecycle:v1"));
        _settlement = _checkedImplementation(implementations[2], keccak256("JobRegistrySettlement:v1"));

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
        if (address(_disputeModule) != address(0)) {
            if (_disputeModule.version() != 2) revert InvalidDisputeModule();
            disputeModule = _disputeModule;
            emit DisputeModuleUpdated(address(_disputeModule));
            emit ModuleUpdated("DisputeModule", address(_disputeModule));
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

    function implementationModules() external view returns (address[3] memory) {
        return [_configuration, _lifecycle, _settlement];
    }

    /// @notice Records evidence of a token burn by the employer.
    /// @dev Employers must acknowledge the active tax policy before calling.
    function submitBurnReceipt(uint256 jobId, bytes32 burnTxHash, uint256 amount, uint256 blockNumber) external {
        _delegate(_lifecycle);
    }

    /// @notice Confirms previously submitted burn evidence.
    /// @dev Employers must acknowledge the active tax policy before calling.
    function confirmEmployerBurn(uint256 jobId, bytes32 burnTxHash) external {
        _delegate(_lifecycle);
    }

    function setPauser(address _pauser) external {
        _delegate(_configuration);
    }

    function setPauserManager(address manager) external {
        _delegate(_configuration);
    }

    function setModules(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _disputeModule,
        ICertificateNFT _certNFT,
        IFeePool _feePool,
        address[] calldata _ackModules
    ) external {
        _delegate(_configuration);
    }

    /// @notice Update the identity registry used for agent verification.
    /// @param registry Address of the IdentityRegistry contract.
    function setIdentityRegistry(IIdentityRegistry registry) external {
        _delegate(_configuration);
    }

    /// @notice Switch the active dispute module.
    /// @param module Address of the new dispute module contract.
    function setDisputeModule(IDisputeModule module) external {
        _delegate(_configuration);
    }

    /// @notice Update the validation module used to source validator lists.
    /// @param module ValidationModule contract address.
    function setValidationModule(IValidationModule module) external {
        _delegate(_configuration);
    }

    /// @notice Update the audit module used for post-completion spot checks.
    /// @param module Address of the audit module contract (zero to disable).
    function setAuditModule(IAuditModule module) external {
        _delegate(_configuration);
    }

    /// @notice Update the stake manager reference.
    /// @param manager StakeManager contract address.
    function setStakeManager(IStakeManager manager) external {
        _delegate(_configuration);
    }

    /// @notice Update the reputation engine reference.
    function setReputationEngine(IReputationEngine engine) external {
        _delegate(_configuration);
    }

    /// @notice Update the certificate NFT module reference.
    function setCertificateNFT(ICertificateNFT nft) external {
        _delegate(_configuration);
    }

    /// @notice Update the ENS root node used for agent verification.
    /// @param node Namehash of the agent parent node (e.g. `agent.agi.eth`).
    function setAgentRootNode(bytes32 node) external {
        _delegate(_configuration);
    }

    /// @notice Update the Merkle root for the agent allowlist.
    /// @param root Merkle root of approved agent addresses.
    function setAgentMerkleRoot(bytes32 root) external {
        _delegate(_configuration);
    }

    /// @notice Increment the agent authorization cache version, invalidating all
    /// existing cached authorizations.
    function bumpAgentAuthCacheVersion() public {
        _delegate(_configuration);
    }

    /// @notice Update the ENS root node used for validator verification.
    /// @param node Namehash of the validator parent node (e.g. `club.agi.eth`).
    function setValidatorRootNode(bytes32 node) external {
        _delegate(_configuration);
    }

    /// @notice Update the Merkle root for the validator allowlist.
    /// @param root Merkle root of approved validator addresses.
    function setValidatorMerkleRoot(bytes32 root) external {
        _delegate(_configuration);
    }

    /// @notice Refresh or invalidate cached agent authorization entries.
    /// @param agent Address of the agent being updated.
    /// @param authorized True to refresh the cache entry, false to invalidate it.
    function updateAgentAuthCache(address agent, bool authorized) external {
        _delegate(_configuration);
    }

    /// @notice Update the duration for cached agent authorizations.
    /// @param duration Seconds an authorization remains valid in cache.
    function setAgentAuthCacheDuration(uint256 duration) external {
        _delegate(_configuration);
    }

    /// @notice update the FeePool contract used for revenue sharing
    function setFeePool(IFeePool _feePool) external {
        _delegate(_configuration);
    }

    /// @notice update the treasury address used for blacklisted payouts
    /// @dev Treasury must be zero (burn) or a non-owner address
    function setTreasury(address _treasury) external {
        _delegate(_configuration);
    }

    /// @notice update the required agent stake for each job
    function setJobStake(uint96 stake) external {
        _delegate(_configuration);
    }

    /// @notice update the minimum global stake required for agents when applying
    function setMinAgentStake(uint256 stake) external {
        _delegate(_configuration);
    }

    /// @notice update the percentage of each job reward taken as a protocol fee
    function setFeePct(uint256 _feePct) external {
        _delegate(_configuration);
    }

    /// @notice update validator reward percentage of job reward
    function setValidatorRewardPct(uint256 pct) external {
        _delegate(_configuration);
    }

    /// @notice set the maximum allowed job reward
    function setMaxJobReward(uint256 maxReward) external {
        _delegate(_configuration);
    }

    /// @notice set the maximum allowed job duration in seconds
    function setJobDurationLimit(uint256 limit) external {
        _delegate(_configuration);
    }

    /// @notice Set the maximum number of simultaneously active jobs an agent may hold.
    /// @dev A value of zero disables the limit.
    function setMaxActiveJobsPerAgent(uint256 limit) external {
        _delegate(_configuration);
    }

    /// @notice set additional grace period after a job's deadline before it can expire
    function setExpirationGracePeriod(uint256 period) external {
        _delegate(_configuration);
    }

    /// @notice Sets the TaxPolicy contract holding the canonical disclaimer.
    /// @dev Only callable by the owner; the policy address cannot be zero and
    /// must explicitly report tax exemption.
    function setTaxPolicy(ITaxPolicy _policy) external {
        _delegate(_configuration);
    }

    /// @notice Pause job lifecycle interactions
    function pause() external {
        _delegate(_configuration);
    }

    /// @notice Resume job lifecycle interactions
    function unpause() external {
        _delegate(_configuration);
    }

    /// @notice Allow or revoke an acknowledger address.
    /// @dev When `allowed` is true, `acknowledger` must be a non-zero address representing a valid contract or EOA.
    /// @param acknowledger Address granted permission to acknowledge for users.
    /// @param allowed True to allow the address, false to revoke.
    function setAcknowledger(address acknowledger, bool allowed) external {
        _delegate(_configuration);
    }

    /// @notice Acknowledge the current tax policy.
    /// @dev Retrieves the acknowledgement text from the `TaxPolicy` contract
    /// and emits it for off-chain visibility so participants have an on-chain
    /// record of the exact disclaimer accepted.
    /// @return ack Human‑readable disclaimer confirming the caller bears all
    /// tax responsibility.
    function acknowledgeTaxPolicy() external returns (string memory ack) {
        _delegate(_lifecycle);
    }

    /// @notice Acknowledge the current tax policy on behalf of a user.
    /// @param user Address acknowledging the policy.
    /// @return ack Human-readable disclaimer confirming the caller bears all tax responsibility.
    function acknowledgeFor(address user) external returns (string memory ack) {
        _delegate(_lifecycle);
    }

    function setJobParameters(uint256 maxReward, uint256 stake) external {
        _delegate(_configuration);
    }

    /// @notice Apply a batch of configuration updates atomically.
    /// @param config Packed configuration toggles and values to apply.
    /// @param acknowledgerUpdates Acknowledger allow/deny list updates.
    /// @param ackModules Additional acknowledge-for modules to enable.
    function applyConfiguration(
        ConfigUpdate calldata config,
        AcknowledgerUpdate[] calldata acknowledgerUpdates,
        address[] calldata ackModules
    ) external {
        _delegate(_configuration);
    }

    function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string calldata uri)
        external
        returns (uint256 jobId)
    {
        _delegate(_lifecycle);
    }

    function createJobWithAgentTypes(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        bytes32 specHash,
        string calldata uri
    ) external returns (uint256 jobId) {
        _delegate(_lifecycle);
    }

    /**
     * @notice Acknowledge the tax policy and create a job in one transaction.
     * @dev `reward` uses 18-decimal base units. Caller must `approve` the
     *      StakeManager for `reward + fee` $AGIALPHA before calling.
     * @param reward Job reward in $AGIALPHA with 18 decimals.
     * @param uri Metadata URI describing the job.
     * @return jobId Identifier of the newly created job.
     */
    function acknowledgeAndCreateJob(uint256 reward, uint64 deadline, bytes32 specHash, string calldata uri)
        external
        returns (uint256 jobId)
    {
        _delegate(_lifecycle);
    }

    function acknowledgeAndCreateJobWithAgentTypes(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        bytes32 specHash,
        string calldata uri
    ) external returns (uint256 jobId) {
        _delegate(_lifecycle);
    }

    function applyForJob(uint256 jobId, string calldata subdomain, bytes32[] calldata proof) external {
        _delegate(_lifecycle);
    }

    /**
     * @notice Acknowledge the current tax policy and apply for a job.
     * @dev No tokens are transferred. Job reward and stake amounts elsewhere
     *      use 18-decimal $AGIALPHA units. Any stake deposits require prior
     *      `approve` calls on the $AGIALPHA token via the `StakeManager`.
     * @param jobId Identifier of the job to apply for.
     */
    function acknowledgeAndApply(uint256 jobId, string calldata subdomain, bytes32[] calldata proof) external {
        _delegate(_lifecycle);
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
    function stakeAndApply(uint256 jobId, uint256 amount, string calldata subdomain, bytes32[] calldata proof)
        external
    {
        _delegate(_lifecycle);
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
    ) public {
        _delegate(_lifecycle);
    }

    /// @notice Acknowledge the tax policy and submit work in one call.
    function acknowledgeAndSubmit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external {
        _delegate(_lifecycle);
    }

    /// @notice Record that reputation updates have already been applied for a job.
    /// @param jobId Identifier of the job that triggered the update.
    function markReputationProcessed(uint256 jobId) external {
        _delegate(_lifecycle);
    }

    /// @param jobId Identifier of the job being finalised.
    /// @param success True if validators approved the job.
    function finalizeAfterValidation(uint256 jobId, bool success) external {
        _delegate(_settlement);
    }

    function validationComplete(uint256 jobId, bool success) external {
        _delegate(_settlement);
    }

    /// @notice Record a failed job outcome when validation quorum is not met.
    /// @dev This function only updates the job state; the employer or
    ///      governance must later call {finalize} to settle funds and
    ///      reputation changes.
    /// @param jobId Identifier of the job being recorded.
    function forceFinalize(uint256 jobId) external {
        _delegate(_settlement);
    }

    /// @notice Receive validation outcome from the ValidationModule
    /// @param jobId Identifier of the job
    /// @param success True if validators approved the job
    /// @param validators Validators that participated in validation
    function onValidationResult(uint256 jobId, bool success, address[] calldata validators) external {
        _delegate(_lifecycle);
    }

    /// @notice Agent or employer disputes a job outcome with a hash of off-chain evidence.
    /// @param jobId Identifier of the disputed job.
    /// @param evidenceHash Keccak256 hash of the evidence stored off-chain.
    /// @param reason Plain-text description or URI describing the dispute.
    function dispute(uint256 jobId, bytes32 evidenceHash, string calldata reason) public {
        _delegate(_settlement);
    }

    /// @notice Escalate a stalled validation into the dispute process.
    /// @dev Callable only by governance (timelock/SystemPause) as part of the incident response playbook.
    /// @param jobId Identifier of the job requiring manual intervention.
    /// @param reason Context string explaining the escalation.
    function escalateToDispute(uint256 jobId, string calldata reason) external {
        _delegate(_settlement);
    }

    /// @notice Backwards-compatible wrapper for legacy integrations.
    /// @dev Calls {dispute} with the provided evidence hash.
    function raiseDispute(uint256 jobId, bytes32 evidenceHash) public {
        _delegate(_settlement);
    }

    /// @notice Overload supporting plain-text dispute reasons.
    /// @param jobId Identifier of the disputed job.
    /// @param reason Plain-text or URI reason for the dispute.
    function raiseDispute(uint256 jobId, string calldata reason) public {
        _delegate(_settlement);
    }

    /**
     * @notice Acknowledge the tax policy if needed and raise a dispute with
     *         supporting evidence stored off-chain.
     * @dev No tokens are transferred; any stake requirements elsewhere use
     *      18-decimal $AGIALPHA units that must have been approved previously.
     * @param jobId Identifier of the disputed job.
     * @param evidenceHash Keccak256 hash of the off-chain evidence.
     */
    function acknowledgeAndDispute(uint256 jobId, bytes32 evidenceHash, string calldata reason) public {
        _delegate(_settlement);
    }

    /// @notice Backwards-compatible helper without a reason string.
    function acknowledgeAndDispute(uint256 jobId, bytes32 evidenceHash) external {
        _delegate(_settlement);
    }

    /// @notice Resolve a dispute relayed by the dispute module.
    /// @dev After resolution this function only records the result, moving the
    ///      job to the completed state. The employer or governance must call
    ///      {finalize} separately to settle funds and reputation.
    /// @param jobId Identifier of the disputed job
    /// @param employerWins True if the employer won the dispute
    function resolveDispute(uint256 jobId, bool employerWins) external {
        _delegate(_settlement);
    }

    /// @notice Finalize a job and trigger payouts and reputation changes.
    /// @dev The dispute module may call this without acknowledgement as it
    ///      merely relays the arbiter's ruling and holds no tax liability.
    function finalize(uint256 jobId) public {
        _delegate(_settlement);
    }

    /// @notice Acknowledge the tax policy and finalise the job in one call.
    /// @param jobId Identifier of the job to finalise
    function acknowledgeAndFinalize(uint256 jobId) external {
        _delegate(_settlement);
    }

    /// @notice Acknowledge the tax policy and cancel a job in one call.
    /// @param jobId Identifier of the job to cancel
    function acknowledgeAndCancel(uint256 jobId) external {
        _delegate(_settlement);
    }

    /// @notice Cancel an unassigned job and refund the employer.
    /// @dev Convenience wrapper matching earlier interface expectations.
    /// Calls {cancelJob} which handles tax acknowledgement checks and
    /// refunds any locked reward back to the employer.
    /// @param jobId Identifier of the job to cancel.
    function cancel(uint256 jobId) external {
        _delegate(_settlement);
    }

    function cancelJob(uint256 jobId) public {
        _delegate(_settlement);
    }

    /// @notice Owner can delist an unassigned job and refund the employer.
    /// @param jobId Identifier of the job to delist.
    function delistJob(uint256 jobId) external {
        _delegate(_configuration);
    }

    /// @notice Mark an applied job as timed out and settle funds directly.
    /// @param jobId Identifier of the job to mark as timed out.
    function claimTimeout(uint256 jobId) external {
        _delegate(_settlement);
    }

    /// @notice Cancel an assigned job that failed to submit before its deadline.
    /// @dev Only the employer or governance may trigger this after the deadline.
    /// @param jobId Identifier of the job to cancel.
    function cancelExpiredJob(uint256 jobId) public {
        _delegate(_settlement);
    }
}
