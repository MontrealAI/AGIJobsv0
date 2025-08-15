// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IENS
/// @notice Minimal interface for retrieving resolver addresses from the ENS registry.
interface IENS {
    /// @notice Get resolver address for a node.
    /// @param node The ENS node hash.
    /// @return resolverAddr Address of the resolver for `node`.
    function resolver(bytes32 node) external view returns (address resolverAddr);
}
