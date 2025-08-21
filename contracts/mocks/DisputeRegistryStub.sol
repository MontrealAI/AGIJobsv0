// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IDisputeModule {
    function raiseDispute(uint256 jobId, address claimant) external;
}

/// @notice Simple job registry stub to interact with DisputeModule in tests
contract DisputeRegistryStub {
    struct Job {
        address agent;
        address employer;
        uint256 reward;
        uint256 stake;
        uint8 state;
    }

    mapping(uint256 => Job) public jobs;
    uint256 public taxPolicyVersion = 1;
    mapping(address => uint256) public taxAcknowledgedVersion;

    function setJob(uint256 id, Job calldata job) external {
        jobs[id] = job;
    }

    function acknowledge(address user) external {
        taxAcknowledgedVersion[user] = taxPolicyVersion;
    }

    function resolveDispute(uint256, bool) external {}

    function finalize(uint256) external {}

    function appeal(address module, uint256 jobId) external payable {
        IDisputeModule(module).raiseDispute(jobId, msg.sender);
    }
}
