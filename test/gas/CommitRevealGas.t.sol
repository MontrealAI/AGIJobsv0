// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {CommitRevealMock} from "../../contracts/CommitRevealMock.sol";

contract CommitRevealGas {
    CommitRevealMock internal target = new CommitRevealMock();

    function testCommitGas() public {
        bytes32 commitHash = keccak256(abi.encodePacked(uint256(1), uint256(0), true, bytes32("salt"), bytes32("spec")));
        target.commit(1, commitHash);
    }

    function testRevealGas() public {
        uint256 jobId = 2;
        bool approve = true;
        bytes32 salt = bytes32("salt");
        bytes32 specHash = bytes32("spec");
        bytes32 commitHash = keccak256(abi.encodePacked(jobId, target.nonces(jobId), approve, salt, specHash));
        target.commit(jobId, commitHash);
        target.reveal(jobId, approve, salt, specHash);
    }
}
