// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IJobRegistry
/// @notice Interface for the JobRegistry module responsible for job lifecycle management
interface IJobRegistry {
    enum JobState { Open, Assigned, InReview, Finalized, Disputed }

    struct Job {
        address employer;
        address agent;
        uint256 payout;
        uint256 deadline;
        JobState state;
    }

    event JobCreated(uint256 indexed jobId, address indexed employer, uint256 payout, uint256 deadline);
    event JobAssigned(uint256 indexed jobId, address indexed agent);
    event JobCompletionRequested(uint256 indexed jobId, string resultURI);
    event JobFinalized(uint256 indexed jobId, bool success);

    function createJob(uint256 payout, uint256 duration, string calldata metadata) external returns (uint256 jobId);
    function applyForJob(uint256 jobId) external;
    function requestJobCompletion(uint256 jobId, string calldata resultURI) external;
    function finalizeJob(uint256 jobId) external;
    function disputeJob(uint256 jobId) external;
}

