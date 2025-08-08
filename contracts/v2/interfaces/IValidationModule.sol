// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IValidationModule
/// @notice Interface for validator selection and commit-reveal voting
interface IValidationModule {
    event ValidatorsSelected(uint256 indexed jobId, address[] validators);
    event VoteCommitted(uint256 indexed jobId, address indexed validator, bytes32 commitHash);
    event VoteRevealed(uint256 indexed jobId, address indexed validator, bool approve);

    /// @notice Select validators for a given job
    /// @param jobId Identifier of the job
    /// @return Array of selected validator addresses
    function selectValidators(uint256 jobId) external returns (address[] memory);

    /// @notice Commit a validation hash for a job
    /// @param jobId Identifier of the job being voted on
    /// @param commitHash Hash of the vote and salt
    function commitValidation(uint256 jobId, bytes32 commitHash) external;

    /// @notice Reveal a previously committed validation vote
    /// @param jobId Identifier of the job
    /// @param approve True to approve, false to reject
    /// @param salt Salt used in the original commitment
    function revealValidation(uint256 jobId, bool approve, bytes32 salt) external;

    /// @notice Tally revealed votes and determine job outcome
    /// @param jobId Identifier of the job
    /// @return success True if validators approved the job
    function tally(uint256 jobId) external returns (bool success);

    /// @notice Owner configuration for timing windows
    function setCommitRevealWindows(uint256 commitWindow, uint256 revealWindow) external;

    /// @notice Owner configuration for validator counts
    function setValidatorBounds(uint256 minValidators, uint256 maxValidators) external;

    /// @notice Owner configuration for randomness seed
    function setRandomnessSeed(bytes32 seed) external;
}

