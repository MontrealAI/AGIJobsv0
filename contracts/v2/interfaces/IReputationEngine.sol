// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IReputationEngine
/// @notice Interface for tracking and updating participant reputation scores
interface IReputationEngine {
    event ReputationChanged(address indexed user, int256 delta, uint256 newScore);
    event BlacklistUpdated(address indexed user, bool status);

    function add(address user, uint256 amount) external;
    function subtract(address user, uint256 amount) external;
    function reputation(address user) external view returns (uint256);
    function isBlacklisted(address user) external view returns (bool);

    /// @notice Owner functions
    function setModule(address module, bool allowed) external;
    function setRole(address user, uint8 role) external;
    function setThresholds(uint256 agentThreshold, uint256 validatorThreshold) external;
    function setBlacklist(address user, bool status) external;
}

