// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IDisputeModule
/// @notice Interface for raising and resolving disputes with evidence
interface IDisputeModule {
    event DisputeRaised(uint256 indexed jobId, address indexed claimant, string evidence);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event AppealFeeUpdated(uint256 fee);
    event ModeratorUpdated(address moderator);
    event DisputeWindowUpdated(uint256 window);

    function raiseDispute(uint256 jobId, string calldata evidence) external;
    function resolveDispute(uint256 jobId, bool employerWins) external;
    function setAppealFee(uint256 fee) external;
    function setDisputeWindow(uint256 window) external;
    function setModerator(address moderator) external;
}
