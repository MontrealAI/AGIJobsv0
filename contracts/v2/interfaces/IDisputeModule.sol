// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ITaxPolicy} from "./ITaxPolicy.sol";

/// @title IDisputeModule
/// @notice Minimal interface for the dispute module used by the arbitrator committee.
interface IDisputeModule {
    function version() external view returns (uint256);

    function setTaxPolicy(ITaxPolicy policy) external;

    function raiseDispute(
        uint256 jobId,
        address claimant,
        bytes32 evidenceHash,
        string calldata reason
    ) external;

    function raiseGovernanceDispute(uint256 jobId, string calldata reason) external;

    function resolveDispute(uint256 jobId, bool employerWins) external;

    function resolveWithSignatures(
        uint256 jobId,
        bool employerWins,
        bytes[] calldata signatures
    ) external;

    function submitEvidence(
        uint256 jobId,
        bytes32 evidenceHash,
        string calldata uri
    ) external;

    function slashValidator(
        address juror,
        uint256 amount,
        address employer
    ) external;
}

