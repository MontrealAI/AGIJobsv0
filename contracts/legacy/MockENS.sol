// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

/// @title MockENS
/// @notice Basic ENS registry mock returning configurable resolver addresses.
contract MockENS {
    mapping(bytes32 => address) public resolvers;

    function resolver(bytes32 node) external view returns (address) {
        return resolvers[node];
    }

    function setResolver(bytes32 node, address resolver_) external {
        resolvers[node] = resolver_;
    }
}
