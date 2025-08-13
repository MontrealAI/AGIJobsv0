// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IDisputeModule
/// @notice Interface for raising and resolving disputes with token bonds
interface IDisputeModule {
    event DisputeRaised(uint256 indexed jobId, address indexed caller, string evidence);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event ModeratorUpdated(address moderator);
    event AppealFeeUpdated(uint256 fee);
    event DisputeWindowUpdated(uint256 window);

    /// @notice Post a dispute bond and submit evidence for a job
    /// @param jobId Identifier of the disputed job
    /// @param evidence Supporting evidence for the dispute
    function raiseDispute(uint256 jobId, string calldata evidence) external;

    /// @notice Resolve an existing dispute after the dispute window elapses
    /// @param jobId Identifier of the job being disputed
    function resolveDispute(uint256 jobId) external;

    /// @notice Configure the appeal fee in token units (6 decimals)
    function setAppealFee(uint256 fee) external;

    /// @notice Configure the moderator address authorised to resolve disputes
    function setModerator(address moderator) external;

    /// @notice Configure the minimum window before disputes may be resolved
    function setDisputeWindow(uint256 window) external;
}
