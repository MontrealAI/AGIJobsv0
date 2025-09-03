// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

/// @title MockNameWrapper
/// @notice Simplified ENS NameWrapper mock returning configurable owners.
contract MockNameWrapper {
    mapping(uint256 => address) public owners;

    function ownerOf(uint256 node) external view returns (address) {
        return owners[node];
    }

    function setOwner(uint256 node, address owner) external {
        owners[node] = owner;
    }
}
