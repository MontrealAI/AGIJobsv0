// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IDisputeModule
/// @notice Interface for raising and resolving disputes
interface IDisputeModule {
    event DisputeRaised(uint256 indexed jobId, address indexed claimant);
    event DisputeResolved(
        uint256 indexed jobId,
        address indexed resolver,
        bool employerWins
    );
    event DisputeFeeUpdated(uint256 fee);
    event ModeratorUpdated(address moderator, bool enabled);
    event DisputeWindowUpdated(uint256 window);

    function raiseDispute(uint256 jobId, address claimant) external;
    function resolve(uint256 jobId, bool employerWins) external;
    function setDisputeFee(uint256 fee) external;
    function setDisputeWindow(uint256 window) external;
    function addModerator(address moderator) external;
    function removeModerator(address moderator) external;
}
