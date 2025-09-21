// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IDisputeModule
/// @notice Minimal interface for the dispute module used by the arbitrator committee.
interface IDisputeModule {
    function version() external view returns (uint256);

    function raiseDispute(
        uint256 jobId,
        address claimant,
        bytes32 evidenceHash,
        string calldata reason
    ) external;

    function resolveDispute(uint256 jobId, bool employerWins) external;

    function slashValidator(
        address juror,
        uint256 amount,
        address employer
    ) external;
}

