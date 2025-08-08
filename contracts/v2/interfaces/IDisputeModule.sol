// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title IDisputeModule
/// @notice Interface for raising and resolving disputes or appeals
interface IDisputeModule {
    event AppealRaised(uint256 indexed jobId, address indexed caller);
    event AppealResolved(uint256 indexed jobId, bool employerWins);
    event AppealFeeUpdated(uint256 fee);
    event ModeratorUpdated(address moderator);

    function appeal(uint256 jobId) external payable;
    function resolve(uint256 jobId, bool employerWins) external;

    /// @notice Owner configuration for appeal economics
    /// @dev Only callable by contract owner
    function setAppealFee(uint256 fee) external;

    /// @notice Owner configuration for dispute moderator
    /// @dev Only callable by contract owner
    function setModerator(address moderator) external;
}
