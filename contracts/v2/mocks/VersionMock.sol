// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Minimal contract exposing a configurable `version` value.
contract VersionMock {
    uint256 public version;
    bytes32 public constant terminalPolicyId = keccak256("AGIJobs:terminal-reputation-v3");

    constructor(uint256 v) {
        version = v;
    }
}
