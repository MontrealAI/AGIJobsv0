// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IReputationEngine
/// @notice Interface for tracking and updating participant reputation scores
interface IReputationEngine {
    /// @dev Reverts when a caller is not authorised to update reputation
    error UnauthorizedCaller(address caller);

    /// @dev Reverts when attempting to act on a blacklisted user
    error BlacklistedUser(address user);

    event ReputationChanged(address indexed user, int256 delta, uint256 newScore);
    event Blacklisted(address indexed user, bool status);

    /// @notice Increase a user's reputation score
    /// @param user Address whose reputation is increased
    /// @param amount Amount to add to the user's score
    /// @dev Reverts with {UnauthorizedCaller} if caller is not permitted
    ///      or {BlacklistedUser} if the user is blacklisted
    function add(address user, uint256 amount) external;

    /// @notice Decrease a user's reputation score
    /// @param user Address whose reputation is decreased
    /// @param amount Amount to subtract from the user's score
    /// @dev Reverts with {UnauthorizedCaller} if caller is not permitted
    ///      or {BlacklistedUser} if the user is blacklisted
    function subtract(address user, uint256 amount) external;

    /// @notice Retrieve a user's reputation score
    /// @param user Address to query
    /// @return The current reputation score of the user
    function reputation(address user) external view returns (uint256);

    /// @notice Check if a user is blacklisted
    /// @param user Address to query
    /// @return True if the user is blacklisted
    function isBlacklisted(address user) external view returns (bool);

    /// @notice Owner functions

    /// @notice Allow or disallow a caller to update reputation
    /// @param caller Address of the caller to configure
    /// @param allowed True to authorise the caller, false to revoke
    function setCaller(address caller, bool allowed) external;

    /// @notice Set the minimum score threshold for certain actions
    /// @param newThreshold New reputation threshold value
    function setThreshold(uint256 newThreshold) external;

    /// @notice Add or remove a user from the blacklist
    /// @param user Address to update
    /// @param status True to blacklist the user, false to remove
    function setBlacklist(address user, bool status) external;
}

