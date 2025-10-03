// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IJobRegistry
/// @notice Interface for orchestrating job lifecycles and module coordination
interface IJobRegistry {
    /// @notice Module version for compatibility checks.
    function version() external view returns (uint256);
    enum Status {
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
        Status status;
        bool success;
        bool burnConfirmed;
        uint8 agentTypes;
        uint32 feePct;
        uint32 agentPct;
        uint64 deadline;
        uint64 assignedAt;
    }

    /// @dev Reverts when job creation parameters have not been configured
    error JobParametersUnset();

    /// @dev Reverts when referencing a job that does not exist
    error InvalidJob(uint256 jobId);

    /// @dev Reverts when an operation is invoked by a non-employer
    error OnlyEmployer(address caller);

    /// @dev Reverts when an operation is invoked by a non-agent
    error OnlyAgent(address caller);

    /// @dev Reverts when a job is in an unexpected status
    error InvalidStatus(Status expected, Status actual);

    error BurnReceiptMissing();
    error BurnNotConfirmed();

    // module configuration
    event ModuleUpdated(string module, address indexed newAddress);
    event ValidationModuleUpdated(address module);
    event ReputationEngineUpdated(address engine);
    event StakeManagerUpdated(address manager);
    event CertificateNFTUpdated(address nft);
    event DisputeModuleUpdated(address module);
    event IdentityRegistryUpdated(address identityRegistry);
    event AgentRootNodeUpdated(bytes32 node);
    event AgentMerkleRootUpdated(bytes32 root);
    event JobParametersUpdated(
        uint256 reward,
        uint256 stake,
        uint256 maxJobReward,
        uint256 maxJobDuration,
        uint256 minAgentStake
    );

    // job lifecycle
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
    event ApplicationSubmitted(
        uint256 indexed jobId,
        address indexed applicant,
        string subdomain
    );
    event AgentAssigned(
        uint256 indexed jobId,
        address indexed agent,
        string subdomain
    );
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
    /// @param netPaid Amount paid to the agent after burn
    /// @param fee Protocol fee amount
    event JobPayout(
        uint256 indexed jobId,
        address indexed worker,
        uint256 netPaid,
        uint256 fee
    );
    /// @notice Emitted when a job is finalized
    /// @param jobId Identifier of the job
    /// @param worker Agent who performed the job
    event JobFinalized(uint256 indexed jobId, address indexed worker);
    event JobDisputed(uint256 indexed jobId, address indexed caller);
    event JobCancelled(uint256 indexed jobId);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
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

    // owner wiring of modules

    /// @notice Set the validation module responsible for job verification
    /// @param module Address of the validation module contract
    function setValidationModule(address module) external;

    /// @notice Set the reputation engine used to track participant scores
    /// @param engine Address of the reputation engine contract
    function setReputationEngine(address engine) external;

    /// @notice Set the stake manager contract used for collateral accounting
    /// @param manager Address of the stake manager contract
    function setStakeManager(address manager) external;

    /// @notice Set the certificate NFT contract used to mint completion tokens
    /// @param nft Address of the certificate NFT contract
    function setCertificateNFT(address nft) external;

    /// @notice Set the dispute module contract handling appeals
    /// @param module Address of the dispute module contract
    function setDisputeModule(address module) external;

    /// @notice Set the identity registry used for agent verification
    /// @param registry Address of the identity registry contract
    function setIdentityRegistry(address registry) external;

    /// @notice Update the ENS root node used for agent verification
    function setAgentRootNode(bytes32 node) external;

    /// @notice Update the agent allowlist Merkle root
    function setAgentMerkleRoot(bytes32 root) external;

    /// @notice Retrieve the StakeManager contract handling collateral
    /// @return Address of the StakeManager
    function stakeManager() external view returns (address);

    /// @notice Decode packed job metadata into individual fields.
    function decodeJobMetadata(uint256 packed)
        external
        pure
        returns (JobMetadata memory);

    /// @notice Retrieve validator reward percentage used for reputation context.
    function validatorRewardPct() external view returns (uint256);

    /// @notice Mark that reputation for a job has been processed externally.
    function markReputationProcessed(uint256 jobId) external;

    /// @notice Check whether reputation updates for a job were already applied.
    function reputationProcessed(uint256 jobId) external view returns (bool);

    /// @notice Retrieve the ValidationModule managing validator sets
    /// @return Address of the ValidationModule
    function validationModule() external view returns (address);

    /// @notice Retrieve the validator committee cached for a job.
    function getJobValidators(uint256 jobId) external view returns (address[] memory);

    /// @notice Retrieve the cached approval vote for a validator on a job.
    function getJobValidatorVote(uint256 jobId, address validator) external view returns (bool);

    /// @notice Retrieve the validator roster and approval votes cached for a job.
    function validatorCommittee(uint256 jobId)
        external
        view
        returns (address[] memory validators, bool[] memory approvals);

    /// @notice Owner configuration of job limits
    /// @param maxReward Maximum allowed reward for a job
    /// @param stake Stake required from the agent to accept a job
    function setJobParameters(uint256 maxReward, uint256 stake) external;

    /// @notice set the required agent stake for each job
    function setJobStake(uint96 stake) external;

    /// @notice set the minimum unstaked balance agents must maintain to apply
    function setMinAgentStake(uint256 stake) external;

    /// @notice set the maximum allowed job reward
    function setMaxJobReward(uint256 maxReward) external;

    /// @notice set the maximum allowed job duration in seconds
    function setJobDurationLimit(uint256 limit) external;

    /// @notice update the percentage of each job reward taken as a protocol fee
    function setFeePct(uint256 feePct) external;

    /// @notice update validator reward percentage of job reward
    function setValidatorRewardPct(uint256 pct) external;

    // core job flow

    /// @notice Create a new job specifying reward, deadline and metadata URI
    /// @param reward Amount escrowed as payment for the job
    /// @param deadline Timestamp after which the job expires
    /// @param uri Metadata describing the job
    /// @return jobId Identifier of the newly created job
    function createJob(
        uint256 reward,
        uint64 deadline,
        bytes32 specHash,
        string calldata uri
    ) external returns (uint256 jobId);

    /// @notice Agent expresses interest in a job
    /// @param jobId Identifier of the job to apply for
    /// @param subdomain ENS subdomain label
    /// @param proof Merkle proof for ENS ownership verification
    /// @dev Reverts with {InvalidStatus} if job is not open for applications
    function applyForJob(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external;

    function getSpecHash(uint256 jobId) external view returns (bytes32);

    function burnEvidenceStatus(uint256 jobId)
        external
        view
        returns (bool burnRequired, bool burnSatisfied);

    function submitBurnReceipt(
        uint256 jobId,
        bytes32 burnTxHash,
        uint256 amount,
        uint256 blockNumber
    ) external;

    function hasBurnReceipt(uint256 jobId, bytes32 burnTxHash)
        external
        view
        returns (bool);

    function confirmEmployerBurn(uint256 jobId, bytes32 burnTxHash) external;

    /// @notice Deposit stake and apply for a job in one call
    /// @param jobId Identifier of the job
    /// @param amount Stake amount in $AGIALPHA with 18 decimals
    /// @param subdomain ENS subdomain label
    /// @param proof Merkle proof for ENS ownership verification
    function stakeAndApply(
        uint256 jobId,
        uint256 amount,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external;

    /// @notice Acknowledge the tax policy and apply for a job in one call
    /// @param jobId Identifier of the job to apply for
    /// @param subdomain ENS subdomain label
    /// @param proof Merkle proof for ENS ownership verification
    function acknowledgeAndApply(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external;

    /// @notice Agent submits completed work for validation.
    /// @param jobId Identifier of the job being submitted
    /// @param resultHash Hash of the submission
    /// @param resultURI Metadata URI of the submission
    /// @param subdomain ENS subdomain label
    /// @param proof Merkle proof for ENS ownership verification
    function submit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external;

    /// @notice Acknowledge tax policy and submit work in one call
    /// @param jobId Identifier of the job being submitted
    /// @param resultHash Hash of the submission
    /// @param resultURI Metadata URI of the submission
    /// @param subdomain ENS subdomain label
    /// @param proof Merkle proof for ENS ownership verification
    function acknowledgeAndSubmit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external;

    /// @notice Record validation outcome and update job state
    /// @param jobId Identifier of the job being finalised
    /// @param success True if validators approved the job
    function finalizeAfterValidation(uint256 jobId, bool success) external;

    /// @notice Alias for {finalizeAfterValidation} for backwards compatibility
    function validationComplete(uint256 jobId, bool success) external;

    /// @notice Receive validation outcome from the ValidationModule
    /// @param jobId Identifier of the job being validated
    /// @param success True if validators approved the job
    /// @param validators Validators that participated in the round
    function onValidationResult(
        uint256 jobId,
        bool success,
        address[] calldata validators
    ) external;

    /// @notice Force finalize a job when validation quorum is not met
    /// @param jobId Identifier of the job to finalize
    function forceFinalize(uint256 jobId) external;

    /// @notice Raise a dispute for a completed job
    /// @param jobId Identifier of the disputed job
    /// @param evidenceHash Keccak256 hash of off-chain evidence (optional)
    /// @param reason Plain-text description or URI with additional context
    /// @dev Reverts with {InvalidStatus} or {OnlyAgent}
    function dispute(
        uint256 jobId,
        bytes32 evidenceHash,
        string calldata reason
    ) external;

    /// @notice Convenience overload forwarding a hashed evidence payload.
    function raiseDispute(uint256 jobId, bytes32 evidenceHash) external;

    /// @notice Convenience overload for providing a plain-text reason only.
    function raiseDispute(uint256 jobId, string calldata reason) external;

    /// @notice Governance-only escalation helper to move a job into dispute flow.
    function escalateToDispute(uint256 jobId, string calldata reason) external;

    /// @notice Acknowledge tax policy if needed and raise a dispute with evidence
    /// @param jobId Identifier of the disputed job
    /// @param evidenceHash Keccak256 hash of the evidence (optional)
    /// @param reason Plain-text description or URI with supporting details
    function acknowledgeAndDispute(
        uint256 jobId,
        bytes32 evidenceHash,
        string calldata reason
    ) external;

    /// @notice Backwards-compatible helper without a reason parameter.
    function acknowledgeAndDispute(uint256 jobId, bytes32 evidenceHash) external;

    /// @notice Resolve a dispute and record the final outcome
    /// @param jobId Identifier of the disputed job
    /// @param employerWins True if the employer wins the dispute
    /// @dev Reverts with {InvalidJob} if the job does not exist
    function resolveDispute(uint256 jobId, bool employerWins) external;

    /// @notice Finalise a job after dispute resolution or successful validation
    /// @param jobId Identifier of the job to finalise
    /// @dev Reverts with {InvalidStatus} if job is not ready for finalisation
    function finalize(uint256 jobId) external;

    /// @notice Acknowledge tax policy and finalise the job in one call
    /// @param jobId Identifier of the job to finalise
    function acknowledgeAndFinalize(uint256 jobId) external;

    /// @notice Employer cancels a job before an agent is selected
    /// @param jobId Identifier of the job to cancel
    /// @dev Reverts with {OnlyEmployer} or {InvalidStatus}
    function cancelJob(uint256 jobId) external;

    /// @notice Owner can force-cancel an unassigned job
    /// @param jobId Identifier of the job to cancel
    function forceCancel(uint256 jobId) external;

    // view helper

    /// @notice Retrieve information for a given job
    /// @param jobId Identifier of the job to query
    /// @return Job The job struct containing all job details
    function jobs(uint256 jobId) external view returns (Job memory);

    /// @notice Retrieve reputation statistics for an employer.
    /// @param employer Address of the employer.
    /// @return successful Number of successfully finalised jobs.
    /// @return failed Number of failed or disputed jobs.
    function getEmployerReputation(address employer)
        external
        view
        returns (uint256 successful, uint256 failed);

    /// @notice Compute normalized employer score scaled by 1e18.
    function getEmployerScore(address employer) external view returns (uint256 score);
}
