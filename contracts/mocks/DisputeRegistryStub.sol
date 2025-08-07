// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../v2/interfaces/IDisputeModule.sol";

/// @notice Simple job registry stub to interact with DisputeModule in tests
contract DisputeRegistryStub {
    struct Job {
        address agent;
        address employer;
        uint256 reward;
        uint8 state;
    }

    mapping(uint256 => Job) public jobs;

    function setJob(uint256 id, Job calldata job) external {
        jobs[id] = job;
    }

    function resolveDispute(uint256, bool) external {}

    function raise(address module, uint256 jobId) external payable {
        IDisputeModule(module).raiseDispute{value: msg.value}(jobId);
    }
}
