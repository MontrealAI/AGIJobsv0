// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IReputationEngine
/// @notice Interface for tracking and updating participant reputation scores
interface IReputationEngine {
    event ReputationChanged(address indexed user, int256 delta, uint256 newScore);
    event Blacklisted(address indexed user, bool status);

    function add(address user, uint256 amount) external;
    function subtract(address user, uint256 amount) external;
    function reputation(address user) external view returns (uint256);
    function isBlacklisted(address user) external view returns (bool);

    /// @notice Owner functions
    function setCaller(address caller, bool allowed) external;
    function setThreshold(uint256 newThreshold) external;
    function setBlacklist(address user, bool status) external;
}

