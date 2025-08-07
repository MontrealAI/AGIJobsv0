// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IReputationEngine
/// @notice Interface for tracking and updating participant reputation scores
interface IReputationEngine {
    event ReputationUpdated(address indexed user, int256 delta, uint256 newScore);
    event CallerSet(address caller, bool allowed);
    event ThresholdsUpdated(uint256 agentBlacklistThreshold, uint256 validatorBlacklistThreshold);

    function addReputation(address user, uint256 amount) external;
    function subtractReputation(address user, uint256 amount) external;
    function reputationOf(address user) external view returns (uint256);
    function isBlacklisted(address user) external view returns (bool);

    /// @notice Owner functions
    function setCaller(address caller, bool allowed) external;
    function setThresholds(uint256 agentThreshold, uint256 validatorThreshold) external;
}

