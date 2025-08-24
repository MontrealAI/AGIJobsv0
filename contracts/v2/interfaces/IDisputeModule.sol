// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IDisputeModule
/// @notice Interface for raising and resolving disputes with moderator voting.
interface IDisputeModule {
    event DisputeRaised(uint256 indexed jobId, address indexed claimant);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event ModeratorAdded(address moderator);
    event ModeratorRemoved(address moderator);
    event ArbitratorUpdated(address arbitrator);

    function raiseDispute(
        uint256 jobId,
        address claimant,
        string calldata evidence
    ) external;

    function resolve(uint256 jobId, bool employerWins) external;

    function addModerator(address moderator) external;
    function removeModerator(address moderator) external;
    function setArbitrator(address arbitrator) external;
}

