// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IPlatformRegistry
/// @notice Minimal interface for querying platform registration and scores
interface IPlatformRegistry {
    /// @notice whether an operator is currently registered
    function registered(address operator) external view returns (bool);

    /// @notice routing score for an operator combining stake and reputation
    function getScore(address operator) external view returns (uint256);
}
