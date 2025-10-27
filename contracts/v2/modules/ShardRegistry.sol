// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {Governable} from "../Governable.sol";
import {IShardRegistry} from "../interfaces/IShardRegistry.sol";
import {IShardJobQueue} from "../interfaces/IShardJobQueue.sol";

/// @title ShardRegistry
/// @notice Coordinates shard-specific job queues while presenting a unified registry API.
contract ShardRegistry is IShardRegistry, Governable, Pausable {
    struct ShardInfo {
        IShardJobQueue queue;
        uint256 index;
        bool exists;
    }

    mapping(bytes32 => ShardInfo) private _shards;
    bytes32[] private _shardIds;
    mapping(bytes32 => GlobalJobRef[]) private _crossShardLinks;

    constructor(address governance_) Governable(governance_) {}

    /// @inheritdoc IShardRegistry
    function registerShard(bytes32 shardId, address queue) external onlyGovernance {
        if (_shards[shardId].exists) revert ShardAlreadyRegistered(shardId);
        if (queue == address(0)) revert InvalidQueue(shardId);

        IShardJobQueue shardQueue = IShardJobQueue(queue);
        if (shardQueue.shardId() != shardId) revert InvalidQueue(shardId);
        if (shardQueue.controller() != address(this)) revert InvalidQueue(shardId);

        _shards[shardId] = ShardInfo({queue: shardQueue, index: _shardIds.length, exists: true});
        _shardIds.push(shardId);

        emit ShardRegistered(shardId, queue);
    }

    /// @inheritdoc IShardRegistry
    function deregisterShard(bytes32 shardId) external onlyGovernance {
        ShardInfo storage shard = _getShard(shardId);
        uint256 lastIndex = _shardIds.length - 1;
        uint256 idx = shard.index;
        if (idx != lastIndex) {
            bytes32 lastId = _shardIds[lastIndex];
            _shardIds[idx] = lastId;
            _shards[lastId].index = idx;
        }
        _shardIds.pop();
        delete _shards[shardId];
        emit ShardDeregistered(shardId);
    }

    /// @inheritdoc IShardRegistry
    function setShardParameters(bytes32 shardId, IShardJobQueue.JobParameters calldata params) external onlyGovernance {
        ShardInfo storage shard = _getShard(shardId);
        shard.queue.setJobParameters(params);
        emit ShardParametersUpdated(shardId, params.maxReward, params.maxDuration);
    }

    /// @inheritdoc IShardRegistry
    function pauseShard(bytes32 shardId) external onlyGovernance {
        ShardInfo storage shard = _getShard(shardId);
        shard.queue.pause();
        emit ShardPaused(shardId);
    }

    /// @inheritdoc IShardRegistry
    function unpauseShard(bytes32 shardId) external onlyGovernance {
        ShardInfo storage shard = _getShard(shardId);
        shard.queue.unpause();
        emit ShardUnpaused(shardId);
    }

    /// @inheritdoc IShardRegistry
    function listShards() external view returns (bytes32[] memory shardIds) {
        return _shardIds;
    }

    /// @inheritdoc IShardRegistry
    function getShardQueue(bytes32 shardId) external view returns (address) {
        return address(_getShard(shardId).queue);
    }

    /// @inheritdoc IShardRegistry
    function createJob(bytes32 shardId, bytes32 specHash, string calldata metadataURI)
        external
        whenNotPaused
        returns (GlobalJobRef memory jobRef)
    {
        ShardInfo storage shard = _getShard(shardId);
        _ensureShardActive(shard, shardId);
        uint256 jobId = shard.queue.createJob(msg.sender, specHash, metadataURI);
        jobRef = GlobalJobRef({shardId: shardId, jobId: jobId});
        emit JobCreated(shardId, jobId, msg.sender, specHash, metadataURI);
    }

    /// @inheritdoc IShardRegistry
    function assignAgent(GlobalJobRef calldata jobRef, address agent) external whenNotPaused {
        (ShardInfo storage shard, IShardJobQueue.Job memory job) = _getJob(jobRef);
        _ensureShardActive(shard, jobRef.shardId);
        if (job.employer != msg.sender) revert NotEmployer(jobRef.shardId, jobRef.jobId, msg.sender);
        if (agent == address(0)) revert NotAgent(jobRef.shardId, jobRef.jobId, agent);
        if (job.status != IShardJobQueue.JobStatus.Created) {
            revert InvalidStatus(jobRef.shardId, jobRef.jobId, IShardJobQueue.JobStatus.Created, job.status);
        }

        shard.queue.setAgent(jobRef.jobId, agent);
        shard.queue.setStatus(jobRef.jobId, IShardJobQueue.JobStatus.Assigned);

        emit JobAgentAssigned(jobRef.shardId, jobRef.jobId, agent);
        emit JobStatusUpdated(jobRef.shardId, jobRef.jobId, IShardJobQueue.JobStatus.Assigned);
    }

    /// @inheritdoc IShardRegistry
    function startJob(GlobalJobRef calldata jobRef) external whenNotPaused {
        (ShardInfo storage shard, IShardJobQueue.Job memory job) = _getJob(jobRef);
        _ensureShardActive(shard, jobRef.shardId);
        if (job.agent != msg.sender) revert NotAgent(jobRef.shardId, jobRef.jobId, msg.sender);
        if (job.status != IShardJobQueue.JobStatus.Assigned) {
            revert InvalidStatus(jobRef.shardId, jobRef.jobId, IShardJobQueue.JobStatus.Assigned, job.status);
        }

        shard.queue.setStatus(jobRef.jobId, IShardJobQueue.JobStatus.InProgress);
        emit JobStatusUpdated(jobRef.shardId, jobRef.jobId, IShardJobQueue.JobStatus.InProgress);
    }

    /// @inheritdoc IShardRegistry
    function submitResult(GlobalJobRef calldata jobRef, bytes32 resultHash) external whenNotPaused {
        (ShardInfo storage shard, IShardJobQueue.Job memory job) = _getJob(jobRef);
        _ensureShardActive(shard, jobRef.shardId);
        if (job.agent != msg.sender) revert NotAgent(jobRef.shardId, jobRef.jobId, msg.sender);
        if (job.status != IShardJobQueue.JobStatus.InProgress) {
            revert InvalidStatus(jobRef.shardId, jobRef.jobId, IShardJobQueue.JobStatus.InProgress, job.status);
        }

        shard.queue.setResultHash(jobRef.jobId, resultHash);
        shard.queue.setStatus(jobRef.jobId, IShardJobQueue.JobStatus.Submitted);

        emit JobResultSubmitted(jobRef.shardId, jobRef.jobId, resultHash);
        emit JobStatusUpdated(jobRef.shardId, jobRef.jobId, IShardJobQueue.JobStatus.Submitted);
    }

    /// @inheritdoc IShardRegistry
    function finalizeJob(GlobalJobRef calldata jobRef, bool success) external whenNotPaused {
        (ShardInfo storage shard, IShardJobQueue.Job memory job) = _getJob(jobRef);
        _ensureShardActive(shard, jobRef.shardId);
        if (job.employer != msg.sender) revert NotEmployer(jobRef.shardId, jobRef.jobId, msg.sender);
        if (job.status != IShardJobQueue.JobStatus.Submitted) {
            revert InvalidStatus(jobRef.shardId, jobRef.jobId, IShardJobQueue.JobStatus.Submitted, job.status);
        }

        shard.queue.setCompletion(jobRef.jobId, success);
        shard.queue.setStatus(jobRef.jobId, IShardJobQueue.JobStatus.Finalized);

        emit JobFinalized(jobRef.shardId, jobRef.jobId, success);
        emit JobStatusUpdated(jobRef.shardId, jobRef.jobId, IShardJobQueue.JobStatus.Finalized);
    }

    /// @inheritdoc IShardRegistry
    function cancelJob(GlobalJobRef calldata jobRef) external whenNotPaused {
        (ShardInfo storage shard, IShardJobQueue.Job memory job) = _getJob(jobRef);
        _ensureShardActive(shard, jobRef.shardId);
        if (job.employer != msg.sender) revert NotEmployer(jobRef.shardId, jobRef.jobId, msg.sender);
        if (
            job.status == IShardJobQueue.JobStatus.Finalized || job.status == IShardJobQueue.JobStatus.Cancelled
        ) {
            revert InvalidStatus(jobRef.shardId, jobRef.jobId, IShardJobQueue.JobStatus.None, job.status);
        }

        shard.queue.setStatus(jobRef.jobId, IShardJobQueue.JobStatus.Cancelled);
        emit JobStatusUpdated(jobRef.shardId, jobRef.jobId, IShardJobQueue.JobStatus.Cancelled);
    }

    /// @inheritdoc IShardRegistry
    function linkJobs(GlobalJobRef calldata source, GlobalJobRef calldata target) external whenNotPaused {
        (, IShardJobQueue.Job memory sourceJob) = _getJob(source);
        _ensureJobExists(target);

        if (sourceJob.employer != msg.sender && sourceJob.agent != msg.sender) {
            revert NotParticipant(source.shardId, source.jobId, msg.sender);
        }

        bytes32 key = _encodeKey(source);
        GlobalJobRef[] storage links = _crossShardLinks[key];
        for (uint256 i = 0; i < links.length; ++i) {
            if (links[i].shardId == target.shardId && links[i].jobId == target.jobId) {
                return;
            }
        }
        links.push(GlobalJobRef({shardId: target.shardId, jobId: target.jobId}));
        emit CrossShardLinked(source.shardId, source.jobId, target.shardId, target.jobId);
    }

    /// @inheritdoc IShardRegistry
    function getLinkedJobs(GlobalJobRef calldata jobRef) external view returns (GlobalJobRef[] memory) {
        bytes32 key = _encodeKey(jobRef);
        GlobalJobRef[] storage links = _crossShardLinks[key];
        GlobalJobRef[] memory copies = new GlobalJobRef[](links.length);
        for (uint256 i = 0; i < links.length; ++i) {
            copies[i] = links[i];
        }
        return copies;
    }

    /// @inheritdoc IShardRegistry
    function getJob(GlobalJobRef calldata jobRef) external view returns (IShardJobQueue.Job memory) {
        (, IShardJobQueue.Job memory job) = _getJob(jobRef);
        return job;
    }

    /// @notice Pause the registry.
    function pause() external onlyGovernance {
        _pause();
    }

    /// @notice Unpause the registry.
    function unpause() external onlyGovernance {
        _unpause();
    }

    function _encodeKey(GlobalJobRef calldata jobRef) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(jobRef.shardId, jobRef.jobId));
    }

    function _ensureJobExists(GlobalJobRef calldata jobRef) private view {
        _getJob(jobRef);
    }

    function _ensureShardActive(ShardInfo storage shard, bytes32 shardId) private view {
        if (shard.queue.paused()) revert ShardPausedError(shardId);
    }

    function _getJob(GlobalJobRef calldata jobRef)
        private
        view
        returns (ShardInfo storage shard, IShardJobQueue.Job memory job)
    {
        shard = _getShard(jobRef.shardId);
        try shard.queue.getJob(jobRef.jobId) returns (IShardJobQueue.Job memory storedJob) {
            job = storedJob;
        } catch {
            revert JobNotFound(jobRef.shardId, jobRef.jobId);
        }
    }

    function _getShard(bytes32 shardId) private view returns (ShardInfo storage shard) {
        shard = _shards[shardId];
        if (!shard.exists) revert UnknownShard(shardId);
    }
}
