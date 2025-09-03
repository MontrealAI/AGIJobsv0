// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract CommitRevealMock {
    mapping(uint256 => uint256) public nonces;
    mapping(uint256 => mapping(address => bytes32)) public commits;
    mapping(uint256 => mapping(address => bool)) public revealed;

    function commit(uint256 jobId, bytes32 commitHash) external {
        commits[jobId][msg.sender] = commitHash;
    }

    function reveal(
        uint256 jobId,
        bool approve,
        bytes32 salt,
        bytes32 specHash
    ) external returns (bool) {
        bytes32 expected = keccak256(
            abi.encodePacked(jobId, nonces[jobId], approve, salt, specHash)
        );
        require(commits[jobId][msg.sender] == expected, "hash mismatch");
        revealed[jobId][msg.sender] = true;
        nonces[jobId]++;
        return approve;
    }
}
