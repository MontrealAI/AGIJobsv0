// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IShardJobQueue
/// @notice Minimal interface for shard-specific job queues managed by the shard registry.
interface IShardJobQueue {
    /// @notice States a job can assume inside a shard queue.
    enum JobStatus {
        None,
        Created,
        Assigned,
        InProgress,
        Submitted,
        Finalized,
        Cancelled
    }

    /// @notice Queue-wide parameters applied to new jobs.
    struct JobParameters {
        uint256 maxReward;
        uint64 maxDuration;
        uint32 maxOpenJobs;
        uint32 maxActiveJobs;
    }

    /// @notice Snapshot of a job stored inside the queue.
    struct Job {
        address employer;
        address agent;
        JobStatus status;
        bytes32 specHash;
        bytes32 resultHash;
        string metadataURI;
        bool success;
    }

    event ControllerUpdated(address indexed controller);
    event JobCreated(uint256 indexed jobId, address indexed employer, bytes32 specHash, string metadataURI);
    event JobAgentAssigned(uint256 indexed jobId, address indexed agent);
    event JobStatusChanged(uint256 indexed jobId, JobStatus status);
    event JobResultRecorded(uint256 indexed jobId, bytes32 resultHash);
    event JobCompletionRecorded(uint256 indexed jobId, bool success);
    event JobParametersUpdated(uint256 maxReward, uint64 maxDuration, uint32 maxOpenJobs, uint32 maxActiveJobs);

    error NotController();
    error UnknownJob(uint256 jobId);
    error InvalidShard();
    error InvalidController();
    error InvalidEmployer();
    error InvalidSpecHash();

    error OpenJobsQuotaExceeded(uint32 limit);
    error ActiveJobsQuotaExceeded(uint32 limit);

    /// @notice Return the shard identifier served by this queue.
    function shardId() external view returns (bytes32);

    /// @notice Return the registry/controller authorised to mutate the queue.
    function controller() external view returns (address);

    /// @notice Current queue parameters.
    function getJobParameters() external view returns (JobParameters memory);

    /// @notice Persist a new job.
    function createJob(address employer, bytes32 specHash, string calldata metadataURI)
        external
        returns (uint256 jobId);

    /// @notice Assign the active agent for a job.
    function setAgent(uint256 jobId, address agent) external;

    /// @notice Update job status.
    function setStatus(uint256 jobId, JobStatus status) external;

    /// @notice Store a submitted result hash.
    function setResultHash(uint256 jobId, bytes32 resultHash) external;

    /// @notice Record job completion success flag.
    function setCompletion(uint256 jobId, bool success) external;

    /// @notice Retrieve a job snapshot.
    function getJob(uint256 jobId) external view returns (Job memory);

    /// @notice Update queue parameters.
    function setJobParameters(JobParameters calldata params) external;

    /// @notice Update the authorised controller.
    function setController(address controller_) external;

    /// @notice Pause queue activity.
    function pause() external;

    /// @notice Unpause queue activity.
    function unpause() external;

    /// @notice Whether the queue is currently paused.
    function paused() external view returns (bool);

    /// @notice Current utilisation counters for quota enforcement.
    function getUsage() external view returns (uint32 openJobs, uint32 activeJobs);
}
