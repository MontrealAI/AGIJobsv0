// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IValidationModule
/// @notice Interface for validator selection and commit-reveal voting
interface IValidationModule {
    event ValidatorsSelected(uint256 indexed jobId, address[] validators);
    event VoteCommitted(uint256 indexed jobId, address indexed validator, bytes32 commitHash);
    event VoteRevealed(uint256 indexed jobId, address indexed validator, bool approve);
    event ParametersUpdated();

    /// @dev Reverts when validator selection fails
    error ValidatorSelectionFailed(uint256 jobId);

    /// @dev Reverts when a validator commits more than once
    error AlreadyCommitted(uint256 jobId, address validator);

    /// @dev Reverts when the commit phase is not active
    error CommitPhaseClosed(uint256 jobId);

    /// @dev Reverts when the reveal phase is invalid for the caller
    error RevealPhaseInvalid(uint256 jobId, address validator);

    /// @notice Select validators for a given job
    /// @param jobId Identifier of the job
    /// @return Array of selected validator addresses
    /// @dev Reverts with {ValidatorSelectionFailed} if selection cannot be made
    function selectValidators(uint256 jobId)
        external
        returns (address[] memory);

    /// @notice Commit a vote hash for a job
    /// @param jobId Identifier of the job being voted on
    /// @param commitHash Hash of the vote and salt
    /// @dev Reverts with {AlreadyCommitted} if validator has already committed or
    ///      {CommitPhaseClosed} if committing outside the allowed window
    function commitVote(uint256 jobId, bytes32 commitHash) external;

    /// @notice Reveal a previously committed vote
    /// @param jobId Identifier of the job
    /// @param approve True to approve, false to reject
    /// @param salt Salt used in the original commitment
    /// @dev Reverts with {RevealPhaseInvalid} if reveal is not permitted
    function revealVote(
        uint256 jobId,
        bool approve,
        bytes32 salt
    ) external;

    /// @notice Tally revealed votes and determine job outcome
    /// @param jobId Identifier of the job
    /// @return success True if validators approved the job
    function tally(uint256 jobId) external returns (bool success);

    /// @notice Owner configuration for timing and validator tiers
    /// @param commitWindow Duration of the commit phase in seconds
    /// @param revealWindow Duration of the reveal phase in seconds
    /// @param rewardTiers Reward tiers paid to validators based on ranking
    /// @param validatorsPerTier Number of validators selected per tier
    function setParameters(
        uint256 commitWindow,
        uint256 revealWindow,
        uint256[] calldata rewardTiers,
        uint256[] calldata validatorsPerTier
    ) external;
}
