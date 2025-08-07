// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IDisputeModule
/// @notice Interface for raising and resolving disputes or appeals
interface IDisputeModule {
    event DisputeRaised(uint256 indexed jobId, address indexed caller);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event AppealParametersUpdated();
    event ModeratorUpdated(address moderator);

    function raiseDispute(uint256 jobId) external payable;
    function resolve(uint256 jobId, bool employerWins) external;

    /// @notice Owner configuration for appeal economics
    /// @dev Only callable by contract owner
    function setAppealParameters(uint256 appealFee, uint256 jurySize) external;

    /// @notice Owner configuration for dispute moderator
    /// @dev Only callable by contract owner
    function setModerator(address moderator) external;
}
