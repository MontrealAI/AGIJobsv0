// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IJobRegistry
/// @notice Interface for orchestrating job lifecycles and module coordination
interface IJobRegistry {
    enum Status { None, Created, Completed, Disputed, Finalized }

    struct Job {
        address employer;
        address agent;
        uint256 reward;
        uint256 stake;
        bool success;
        Status status;
    }

    // module configuration
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
        uint256 stake
    );
    event CompletionRequested(uint256 indexed jobId, bool success);
    event JobDisputed(uint256 indexed jobId);
    event JobFinalized(uint256 indexed jobId, bool success);
    event JobParametersUpdated(uint256 reward, uint256 stake);

    // owner wiring of modules
    function setValidationModule(address module) external;
    function setReputationEngine(address engine) external;
    function setStakeManager(address manager) external;
    function setCertificateNFT(address nft) external;
    function setDisputeModule(address module) external;

    /// @notice Owner configuration of job limits
    function setJobParameters(uint256 reward, uint256 stake) external;

    // core job flow
    function createJob(address agent) external returns (uint256 jobId);
    function requestJobCompletion(uint256 jobId) external;
    function dispute(uint256 jobId) external payable;
    function resolveDispute(uint256 jobId, bool employerWins) external;
    function finalize(uint256 jobId) external;

    // view helper
    function jobs(uint256 jobId) external view returns (Job memory);
}
