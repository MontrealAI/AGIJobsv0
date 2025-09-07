// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IJobEscrow
/// @notice Minimal interface for job escrow helpers
interface IJobEscrow {
    event RewardPaid(uint256 indexed jobId, address indexed operator, uint256 amount);
    /// @notice Post a new job and escrow the reward
    function postJob(uint256 reward, string calldata data, bytes32 seed) external returns (uint256);

    /// @notice Operator submits the result for a job
    function submitResult(uint256 jobId, string calldata result) external;

    /// @notice Cancel a job before completion
    function cancelJob(uint256 jobId) external;

    /// @notice Accept the job result and release payment
    function acceptResult(uint256 jobId) external;

    /// @notice Acknowledge the tax policy and accept the job result
    function acknowledgeAndAcceptResult(uint256 jobId) external;
}
