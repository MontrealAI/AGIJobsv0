// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IJobRegistry
/// @notice Interface for orchestrating job lifecycles and module coordination
interface IJobRegistry {
    enum Status {
        None,
        Created,
        Applied,
        Completed,
        Disputed,
        Finalized,
        Cancelled
    }

    struct Job {
        address employer;
        address agent;
        uint256 reward;
        uint256 stake;
        bool success;
        Status status;
        string uri;
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

    // module configuration
    event ModuleUpdated(string module, address newAddress);
    event ValidationModuleUpdated(address module);
    event ReputationEngineUpdated(address engine);
    event StakeManagerUpdated(address manager);
    event CertificateNFTUpdated(address nft);
    event DisputeModuleUpdated(address module);

    // job lifecycle
    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake,
        uint256 fee
    );
    event AgentApplied(uint256 indexed jobId, address indexed agent);
    event JobCompleted(uint256 indexed jobId, bool success);
    event JobFinalized(uint256 indexed jobId, bool success);
    event JobDisputed(uint256 indexed jobId, address indexed caller);

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

    /// @notice Retrieve the StakeManager contract handling collateral
    /// @return Address of the StakeManager
    function stakeManager() external view returns (address);

    /// @notice Owner configuration of job limits
    /// @param reward Reward paid upon successful job completion
    /// @param stake Stake required from the agent to accept a job
    function setJobParameters(uint256 reward, uint256 stake) external;

    // core job flow

    /// @notice Create a new job specifying reward and metadata URI
    /// @param reward Amount escrowed as payment for the job
    /// @param uri Metadata describing the job
    /// @return jobId Identifier of the newly created job
    function createJob(uint256 reward, string calldata uri)
        external
        returns (uint256 jobId);

    /// @notice Agent expresses interest in a job
    /// @param jobId Identifier of the job to apply for
    /// @dev Reverts with {InvalidStatus} if job is not open for applications
    function applyForJob(uint256 jobId) external;

    /// @notice Deposit stake and apply for a job in one call
    /// @param jobId Identifier of the job
    /// @param amount Stake amount in $AGIALPHA with 6 decimals
    function stakeAndApply(uint256 jobId, uint256 amount) external;

    /// @notice Acknowledge the tax policy and apply for a job in one call
    /// @param jobId Identifier of the job to apply for
    function acknowledgeAndApply(uint256 jobId) external;

    /// @notice Agent completes the job and triggers validation
    /// @param jobId Identifier of the job being completed
    /// @dev Reverts with {InvalidStatus} or {OnlyAgent} accordingly
    function completeJob(uint256 jobId) external;

    /// @notice Acknowledge tax policy and complete the job in one call
    /// @param jobId Identifier of the job being completed
    function acknowledgeAndCompleteJob(uint256 jobId) external;

    /// @notice Raise a dispute for a completed job
    /// @param jobId Identifier of the disputed job
    /// @dev Reverts with {InvalidStatus} or {OnlyAgent}
    function dispute(uint256 jobId) external payable;

    /// @notice Acknowledge tax policy if needed and raise a dispute with evidence
    /// @param jobId Identifier of the disputed job
    /// @param evidence Supporting evidence for the dispute
    function acknowledgeAndDispute(uint256 jobId, string calldata evidence) external;

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

    // view helper

    /// @notice Retrieve information for a given job
    /// @param jobId Identifier of the job to query
    /// @return Job The job struct containing all job details
    function jobs(uint256 jobId) external view returns (Job memory);
}
