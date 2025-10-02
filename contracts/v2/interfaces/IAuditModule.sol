// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IAuditModule
/// @notice Interface for scheduling and recording post-completion job audits.
interface IAuditModule {
    /// @notice Module version for compatibility checks.
    function version() external view returns (uint256);

    /// @notice Emitted when a job is randomly selected for an audit.
    event AuditScheduled(
        uint256 indexed jobId,
        address indexed agent,
        bytes32 resultHash,
        bytes32 seed
    );

    /// @notice Emitted when an authorised auditor records the audit outcome.
    event AuditRecorded(
        uint256 indexed jobId,
        address indexed auditor,
        bool passed,
        string details
    );

    /// @notice Emitted when an audit failure triggers a reputation penalty.
    event AuditPenaltyApplied(
        uint256 indexed jobId,
        address indexed agent,
        uint256 penalty
    );

    /// @notice Notify the audit module that a job has been finalised.
    /// @param jobId Identifier of the job.
    /// @param agent Worker that completed the job.
    /// @param success True if the job was approved by validators.
    /// @param resultHash Hash of the job output committed on-chain.
    function onJobFinalized(
        uint256 jobId,
        address agent,
        bool success,
        bytes32 resultHash
    ) external;
}
