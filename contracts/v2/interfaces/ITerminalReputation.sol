// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Versioned job accounting. Payouts use 18-decimal token base units.
interface ITerminalReputation {
    function terminalPolicyId() external view returns (bytes32);
    function registerJob(uint256 jobId) external;
    function assignJob(uint256 jobId, address agent) external;
    function submitJob(uint256 jobId) external;
    function recordRound(
        address registry,
        uint256 jobId,
        uint256 roundId,
        address[] calldata validators,
        bool[] calldata revealed,
        bool[] calldata votes,
        bool penalizeNonReveal
    ) external;
    function finalizeJob(
        uint256 jobId, address agent, bool success, bool attributed, uint256 payout
    ) external returns (uint256 actualGain);
}

interface ITerminalJobRegistry {
    function terminalPolicyId() external view returns (bytes32);
    function jobReputationEngine(uint256 jobId) external view returns (address);
    function validationModule() external view returns (address);
    function resolveDisputeOutcome(uint256 jobId, uint8 outcome, bytes32 evidenceHash) external;
}
