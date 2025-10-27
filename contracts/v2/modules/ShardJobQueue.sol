// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {IShardJobQueue} from "../interfaces/IShardJobQueue.sol";

/// @title ShardJobQueue
/// @notice Lightweight job queue scoped to a single shard and controlled by the ShardRegistry.
contract ShardJobQueue is IShardJobQueue, Ownable, Pausable {
    bytes32 private immutable _shardId;
    address private _controller;
    uint256 private _nextJobId = 1;

    mapping(uint256 => Job) private _jobs;
    JobParameters private _jobParameters;
    uint32 private _openJobs;
    uint32 private _activeJobs;

    modifier onlyController() {
        if (msg.sender != _controller) revert NotController();
        _;
    }

    modifier onlyControllerOrOwner() {
        if (msg.sender != _controller && msg.sender != owner()) revert NotController();
        _;
    }

    constructor(bytes32 shardId_, address owner_) Ownable(owner_) {
        if (shardId_ == bytes32(0)) revert InvalidShard();
        if (owner_ == address(0)) revert InvalidController();
        _shardId = shardId_;
    }

    /// @inheritdoc IShardJobQueue
    function shardId() external view returns (bytes32) {
        return _shardId;
    }

    /// @inheritdoc IShardJobQueue
    function controller() external view returns (address) {
        return _controller;
    }

    /// @inheritdoc IShardJobQueue
    function getJobParameters() external view returns (JobParameters memory) {
        return _jobParameters;
    }

    /// @inheritdoc IShardJobQueue
    function createJob(address employer, bytes32 specHash, string calldata metadataURI)
        external
        onlyController
        whenNotPaused
        returns (uint256 jobId)
    {
        if (employer == address(0)) revert InvalidEmployer();
        if (specHash == bytes32(0)) revert InvalidSpecHash();

        if (_jobParameters.maxOpenJobs > 0) {
            uint32 nextOpen = _openJobs + 1;
            if (nextOpen > _jobParameters.maxOpenJobs) {
                revert OpenJobsQuotaExceeded(_jobParameters.maxOpenJobs);
            }
            _openJobs = nextOpen;
        } else {
            unchecked {
                _openJobs += 1;
            }
        }

        jobId = _nextJobId++;
        Job storage job = _jobs[jobId];
        job.employer = employer;
        job.status = JobStatus.Created;
        job.specHash = specHash;
        job.metadataURI = metadataURI;

        emit JobCreated(jobId, employer, specHash, metadataURI);
        emit JobStatusChanged(jobId, JobStatus.Created);
    }

    /// @inheritdoc IShardJobQueue
    function setAgent(uint256 jobId, address agent) external onlyController {
        Job storage job = _requireJob(jobId);
        job.agent = agent;
        emit JobAgentAssigned(jobId, agent);
    }

    /// @inheritdoc IShardJobQueue
    function setStatus(uint256 jobId, JobStatus status) external onlyController {
        Job storage job = _requireJob(jobId);
        JobStatus previous = job.status;

        if (status == JobStatus.Assigned && !_isActiveStatus(previous)) {
            uint32 nextActive = _activeJobs + 1;
            if (_jobParameters.maxActiveJobs > 0 && nextActive > _jobParameters.maxActiveJobs) {
                revert ActiveJobsQuotaExceeded(_jobParameters.maxActiveJobs);
            }
            _activeJobs = nextActive;
        }

        if (_isTerminalStatus(status) && !_isTerminalStatus(previous)) {
            if (_openJobs > 0) {
                unchecked {
                    _openJobs -= 1;
                }
            }
            if (_isActiveStatus(previous) && _activeJobs > 0) {
                unchecked {
                    _activeJobs -= 1;
                }
            }
        }

        job.status = status;
        emit JobStatusChanged(jobId, status);
    }

    /// @inheritdoc IShardJobQueue
    function setResultHash(uint256 jobId, bytes32 resultHash) external onlyController {
        Job storage job = _requireJob(jobId);
        job.resultHash = resultHash;
        emit JobResultRecorded(jobId, resultHash);
    }

    /// @inheritdoc IShardJobQueue
    function setCompletion(uint256 jobId, bool success) external onlyController {
        Job storage job = _requireJob(jobId);
        job.success = success;
        emit JobCompletionRecorded(jobId, success);
    }

    /// @inheritdoc IShardJobQueue
    function getJob(uint256 jobId) external view returns (Job memory) {
        Job storage job = _jobs[jobId];
        if (job.status == JobStatus.None) revert UnknownJob(jobId);
        return job;
    }

    /// @inheritdoc IShardJobQueue
    function setJobParameters(JobParameters calldata params) external onlyControllerOrOwner {
        _jobParameters = params;
        emit JobParametersUpdated(
            params.maxReward,
            params.maxDuration,
            params.maxOpenJobs,
            params.maxActiveJobs
        );
    }

    /// @inheritdoc IShardJobQueue
    function setController(address controller_) external onlyOwner {
        if (controller_ == address(0)) revert InvalidController();
        _controller = controller_;
        emit ControllerUpdated(controller_);
    }

    /// @inheritdoc IShardJobQueue
    function pause() external onlyControllerOrOwner {
        _pause();
    }

    /// @inheritdoc IShardJobQueue
    function unpause() external onlyControllerOrOwner {
        _unpause();
    }

    /// @inheritdoc IShardJobQueue
    function paused() public view override(IShardJobQueue, Pausable) returns (bool) {
        return Pausable.paused();
    }

    /// @inheritdoc IShardJobQueue
    function getUsage() external view returns (uint32 openJobs, uint32 activeJobs) {
        openJobs = _openJobs;
        activeJobs = _activeJobs;
    }

    function _requireJob(uint256 jobId) private view returns (Job storage job) {
        job = _jobs[jobId];
        if (job.status == JobStatus.None) revert UnknownJob(jobId);
    }

    function _isTerminalStatus(JobStatus status) private pure returns (bool) {
        return status == JobStatus.Finalized || status == JobStatus.Cancelled;
    }

    function _isActiveStatus(JobStatus status) private pure returns (bool) {
        return status == JobStatus.Assigned || status == JobStatus.InProgress || status == JobStatus.Submitted;
    }
}
