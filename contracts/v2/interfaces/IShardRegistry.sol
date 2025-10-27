// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IShardJobQueue} from "./IShardJobQueue.sol";

/// @title IShardRegistry
/// @notice Registry that orchestrates shard-specific queues while exposing a unified API.
interface IShardRegistry {
    struct GlobalJobRef {
        bytes32 shardId;
        uint256 jobId;
    }

    event ShardRegistered(bytes32 indexed shardId, address indexed queue);
    event ShardDeregistered(bytes32 indexed shardId);
    event ShardParametersUpdated(bytes32 indexed shardId, uint256 maxReward, uint64 maxDuration);
    event ShardPaused(bytes32 indexed shardId);
    event ShardUnpaused(bytes32 indexed shardId);
    event JobCreated(
        bytes32 indexed shardId,
        uint256 indexed jobId,
        address indexed employer,
        bytes32 specHash,
        string metadataURI
    );
    event JobAgentAssigned(bytes32 indexed shardId, uint256 indexed jobId, address indexed agent);
    event JobStatusUpdated(bytes32 indexed shardId, uint256 indexed jobId, IShardJobQueue.JobStatus status);
    event JobResultSubmitted(bytes32 indexed shardId, uint256 indexed jobId, bytes32 resultHash);
    event JobFinalized(bytes32 indexed shardId, uint256 indexed jobId, bool success);
    event CrossShardLinked(
        bytes32 indexed fromShard,
        uint256 indexed fromJobId,
        bytes32 indexed toShard,
        uint256 toJobId
    );

    error UnknownShard(bytes32 shardId);
    error ShardAlreadyRegistered(bytes32 shardId);
    error ShardPausedError(bytes32 shardId);
    error InvalidQueue(bytes32 shardId);
    error InvalidStatus(bytes32 shardId, uint256 jobId, IShardJobQueue.JobStatus expected, IShardJobQueue.JobStatus actual);
    error NotEmployer(bytes32 shardId, uint256 jobId, address caller);
    error NotAgent(bytes32 shardId, uint256 jobId, address caller);
    error JobNotFound(bytes32 shardId, uint256 jobId);
    error NotParticipant(bytes32 shardId, uint256 jobId, address caller);

    function registerShard(bytes32 shardId, address queue) external;

    function deregisterShard(bytes32 shardId) external;

    function setShardParameters(bytes32 shardId, IShardJobQueue.JobParameters calldata params) external;

    function pauseShard(bytes32 shardId) external;

    function unpauseShard(bytes32 shardId) external;

    function listShards() external view returns (bytes32[] memory shardIds);

    function getShardQueue(bytes32 shardId) external view returns (address);

    function createJob(bytes32 shardId, bytes32 specHash, string calldata metadataURI)
        external
        returns (GlobalJobRef memory jobRef);

    function assignAgent(GlobalJobRef calldata jobRef, address agent) external;

    function startJob(GlobalJobRef calldata jobRef) external;

    function submitResult(GlobalJobRef calldata jobRef, bytes32 resultHash) external;

    function finalizeJob(GlobalJobRef calldata jobRef, bool success) external;

    function cancelJob(GlobalJobRef calldata jobRef) external;

    function linkJobs(GlobalJobRef calldata source, GlobalJobRef calldata target) external;

    function getLinkedJobs(GlobalJobRef calldata jobRef) external view returns (GlobalJobRef[] memory);

    function getJob(GlobalJobRef calldata jobRef) external view returns (IShardJobQueue.Job memory);
}
