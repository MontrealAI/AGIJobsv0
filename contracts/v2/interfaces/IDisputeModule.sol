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
    event ModeratorUpdated(address moderator, uint256 weight);
    event DisputeWindowUpdated(uint256 window);
    event JobRegistryUpdated(address registry);
    event StakeManagerUpdated(address manager);
    event ModulesUpdated(address indexed jobRegistry, address indexed stakeManager);

    function raiseDispute(
        uint256 jobId,
        address claimant,
        string calldata evidence
    ) external;
    function resolve(
        uint256 jobId,
        bool employerWins,
        bytes[] calldata signatures
    ) external;
    function setDisputeFee(uint256 fee) external;
    function setDisputeWindow(uint256 window) external;
    function addModerator(address moderator, uint256 weight) external;
    function removeModerator(address moderator) external;
    function setJobRegistry(address registry) external;
    function setStakeManager(address manager) external;
}
