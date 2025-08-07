// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IReputationEngine
/// @notice Interface for tracking and updating participant reputation scores
interface IReputationEngine {
    event ReputationUpdated(address indexed user, int256 delta, uint256 newScore);

    function addReputation(address user, uint256 amount) external;
    function subtractReputation(address user, uint256 amount) external;
    function reputationOf(address user) external view returns (uint256);
    function isBlacklisted(address user) external view returns (bool);
}

