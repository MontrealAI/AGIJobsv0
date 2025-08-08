// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IJobRegistry
/// @notice Interface for orchestrating job lifecycles and module coordination
interface IJobRegistry {
    /// @notice Error thrown when a required module address is zero
    error InvalidModuleAddress();
    /// @notice Error thrown when job parameters are not set
    error JobParametersNotSet();
    /// @notice Error thrown when a job is not in the expected state
    error InvalidJobState();
    /// @notice Error thrown when the caller lacks permission for the action
    error NotAuthorized();
    /// @notice Error thrown when a job cannot be disputed
    error DisputeNotAllowed();
    /// @notice Error thrown when attempting to resolve a non-existent dispute
    error NoDispute();
    /// @notice Error thrown when a job cannot be cancelled
    error CannotCancel();
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
    }

    // module configuration
    /// @notice Emitted when the validation module address changes
    /// @param module New validation module
    event ValidationModuleUpdated(address module);
    /// @notice Emitted when the reputation engine address changes
    /// @param engine New reputation engine
    event ReputationEngineUpdated(address engine);
    /// @notice Emitted when the stake manager address changes
    /// @param manager New stake manager
    event StakeManagerUpdated(address manager);
    /// @notice Emitted when the certificate NFT address changes
    /// @param nft New certificate NFT
    event CertificateNFTUpdated(address nft);
    /// @notice Emitted when the dispute module address changes
    /// @param module New dispute module
    event DisputeModuleUpdated(address module);

    // job lifecycle
    /// @notice Emitted when a new job is created
    /// @param jobId Identifier of the job
    /// @param employer Job creator address
    /// @param agent Initially assigned agent (if any)
    /// @param reward Token reward offered
    /// @param stake Stake required from agent
    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake
    );
    /// @notice Emitted when an agent applies for a job
    /// @param jobId Identifier of the job
    /// @param agent Address of the applying agent
    event AgentApplied(uint256 indexed jobId, address indexed agent);
    /// @notice Emitted when a job result is submitted
    /// @param jobId Identifier of the job
    /// @param success Validation outcome
    event JobSubmitted(uint256 indexed jobId, bool success);
    /// @notice Emitted when a job is finalised
    /// @param jobId Identifier of the job
    /// @param success Final job success status
    event JobFinalized(uint256 indexed jobId, bool success);

    // owner wiring of modules
    /// @notice Set the validation module contract
    /// @param module Address of the validation module
    function setValidationModule(address module) external;
    /// @notice Set the reputation engine contract
    /// @param engine Address of the reputation engine
    function setReputationEngine(address engine) external;
    /// @notice Set the stake manager contract
    /// @param manager Address of the stake manager
    function setStakeManager(address manager) external;
    /// @notice Set the certificate NFT contract
    /// @param nft Address of the certificate NFT
    function setCertificateNFT(address nft) external;
    /// @notice Set the dispute module contract
    /// @param module Address of the dispute module
    function setDisputeModule(address module) external;

    /// @notice Owner configuration of job reward and stake amounts
    /// @param reward Fixed reward offered per job
    /// @param stake Stake required from an agent
    function setJobParameters(uint256 reward, uint256 stake) external;

    // core job flow
    /// @notice Create a new job using preset parameters
    /// @return jobId Identifier of the created job
    function createJob() external returns (uint256 jobId);
    /// @notice Apply for an available job
    /// @param jobId Identifier of the job
    function applyForJob(uint256 jobId) external;
    /// @notice Submit job results for validation
    /// @param jobId Identifier of the job
    function submit(uint256 jobId) external;
    /// @notice Raise a dispute for a job outcome
    /// @param jobId Identifier of the job
    function dispute(uint256 jobId) external payable;
    /// @notice Resolve an existing dispute
    /// @param jobId Identifier of the job
    /// @param employerWins Whether the employer prevails
    function resolveDispute(uint256 jobId, bool employerWins) external;
    /// @notice Finalize a job after completion or dispute resolution
    /// @param jobId Identifier of the job
    function finalize(uint256 jobId) external;
    /// @notice Cancel a job before completion
    /// @param jobId Identifier of the job
    function cancelJob(uint256 jobId) external;

    // view helper
    /// @notice Retrieve job details
    /// @param jobId Identifier of the job
    /// @return Job struct containing job information
    function jobs(uint256 jobId) external view returns (Job memory);
}
