// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IReputationEngine
/// @notice Interface for tracking and updating participant reputation scores
interface IReputationEngine {
    event ReputationChanged(address indexed user, int256 delta, uint256 newScore);
    event BlacklistUpdated(address indexed user, bool status);

    function addReputation(address user, uint256 amount) external;
    function subtractReputation(address user, uint256 amount) external;
    function reputationOf(address user) external view returns (uint256);
    function isBlacklisted(address user) external view returns (bool);

    /// @notice Owner functions
    function setCaller(address caller, bool allowed) external;
    function setRole(address user, uint8 role) external;
    function setThresholds(uint256 agentThreshold, uint256 validatorThreshold) external;
}

