// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IJobRegistry} from "../SelfPlayArena.sol";

contract MockJobRegistry is IJobRegistry {
    mapping(uint256 => Job) private _jobs;

    function setJob(uint256 jobId, address employer, address agent) external {
        _jobs[jobId] = Job({
            employer: employer,
            agent: agent,
            reward: 1,
            stake: 1,
            burnReceiptAmount: 0,
            uriHash: bytes32(0),
            resultHash: bytes32(0),
            specHash: bytes32(0),
            packedMetadata: 1
        });
    }

    function clearJob(uint256 jobId) external {
        delete _jobs[jobId];
    }

    function jobs(uint256 jobId) external view override returns (Job memory) {
        Job memory job = _jobs[jobId];
        if (job.agent == address(0)) {
            revert InvalidJob(jobId);
        }
        return job;
    }
}

