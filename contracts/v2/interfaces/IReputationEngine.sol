// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IReputationEngine
/// @notice Interface for tracking and updating participant reputation scores
interface IReputationEngine {
    /// @notice Error thrown when an unauthorised caller attempts an update
    error UnauthorizedCaller();

    /// @notice Emitted when a user's reputation score changes
    /// @param user Address of the user
    /// @param delta Signed change applied to the score
    /// @param newScore Resulting reputation score
    event ReputationChanged(address indexed user, int256 delta, uint256 newScore);
    /// @notice Emitted when a user's blacklist status changes
    /// @param user Address of the user
    /// @param status New blacklist status
    event Blacklisted(address indexed user, bool status);

    /// @notice Increase reputation for a user
    /// @param user Address whose score is increased
    /// @param amount Quantity to add
    function add(address user, uint256 amount) external;
    /// @notice Decrease reputation for a user
    /// @param user Address whose score is decreased
    /// @param amount Quantity to subtract
    function subtract(address user, uint256 amount) external;
    /// @notice Get the reputation score of a user
    /// @param user Address to query
    /// @return Reputation score
    function reputation(address user) external view returns (uint256);
    /// @notice Determine if a user is blacklisted
    /// @param user Address to query
    /// @return True if blacklisted
    function isBlacklisted(address user) external view returns (bool);

    /// @notice Authorise or revoke a caller
    /// @param caller Address of the caller
    /// @param allowed True to authorise
    function setCaller(address caller, bool allowed) external;
    /// @notice Set the reputation threshold for blacklisting
    /// @param newThreshold Reputation score below which users are blacklisted
    function setThreshold(uint256 newThreshold) external;
    /// @notice Manually set blacklist status for a user
    /// @param user Address of the user
    /// @param status New blacklist status
    function setBlacklist(address user, bool status) external;
}

