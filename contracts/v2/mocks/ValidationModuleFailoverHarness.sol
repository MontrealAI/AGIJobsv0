// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ValidationModule, IJobRegistry, IStakeManager} from "../ValidationModule.sol";

contract ValidationModuleFailoverHarness is ValidationModule {
    constructor()
        ValidationModule(
            IJobRegistry(address(0)),
            IStakeManager(address(0)),
            60,
            60,
            3,
            3,
            new address[](0)
        )
    {}

    function forceJobRegistry(address registry) external {
        jobRegistry = IJobRegistry(registry);
    }

    function seedRound(
        uint256 jobId,
        uint256 commitDeadline,
        uint256 revealDeadline
    ) external {
        Round storage r = rounds[jobId];
        r.commitDeadline = commitDeadline;
        r.revealDeadline = revealDeadline;
    }

    function setTallied(uint256 jobId, bool tallied) external {
        rounds[jobId].tallied = tallied;
    }
}

contract FailoverJobRegistryMock {
    event Escalated(uint256 indexed jobId, string reason);

    uint256 public lastJobId;
    string public lastReason;
    uint256 public callCount;

    function escalateToDispute(uint256 jobId, string calldata reason) external {
        lastJobId = jobId;
        lastReason = reason;
        callCount += 1;
        emit Escalated(jobId, reason);
    }

    function version() external pure returns (uint256) {
        return 2;
    }
}
