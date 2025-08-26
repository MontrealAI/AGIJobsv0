// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IDisputeModule
/// @notice Interface for raising and resolving disputes with moderator voting.
interface IDisputeModule {
    event DisputeRaised(
        uint256 indexed jobId,
        address indexed claimant,
        bytes32 indexed evidenceHash
    );
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event ModeratorAdded(address moderator);
    event ModeratorRemoved(address moderator);
    event GovernanceUpdated(address indexed governance);
    event QuorumUpdated(uint256 quorum);
    event VoteCast(
        uint256 indexed jobId,
        address indexed moderator,
        bool employerWins,
        uint256 employerVotes,
        uint256 agentVotes
    );
    event VoteTally(
        uint256 indexed jobId,
        uint256 employerVotes,
        uint256 agentVotes
    );

    function raiseDispute(
        uint256 jobId,
        address claimant,
        bytes32 evidenceHash
    ) external;

    function resolve(uint256 jobId, bool employerWins) external;

    function addModerator(address moderator) external;
    function removeModerator(address moderator) external;
    function setGovernance(address governance) external;
    function setQuorum(uint256 newQuorum) external;
    function getModerators() external view returns (address[] memory);
}

