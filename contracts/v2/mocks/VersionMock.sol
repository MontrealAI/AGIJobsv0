// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Minimal contract exposing a configurable `version` value.
contract VersionMock {
    uint256 public version;

    constructor(uint256 v) {
        version = v;
    }
}
