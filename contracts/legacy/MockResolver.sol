// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

/// @title MockResolver
/// @notice Minimal ENS resolver mock allowing adjustable addr records.
contract MockResolver {
    mapping(bytes32 => address) public addresses;

    function addr(bytes32 node) external view returns (address) {
        return addresses[node];
    }

    function setAddr(bytes32 node, address addr_) external {
        addresses[node] = addr_;
    }
}
