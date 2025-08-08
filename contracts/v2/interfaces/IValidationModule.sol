// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IValidationModule
/// @notice Interface for validator selection and commit-reveal voting
interface IValidationModule {
    /// @notice Error thrown when validators are already selected for a job
    error AlreadySelected();
    /// @notice Error thrown when not enough validators are available
    error InsufficientValidators();
    /// @notice Error thrown when commit phase is closed
    error CommitPhaseClosed();
    /// @notice Error thrown when caller is not a selected validator
    error NotValidator();
    /// @notice Error thrown when a vote has already been committed
    error AlreadyCommitted();
    /// @notice Error thrown when commit phase is still open
    error CommitPhaseOpen();
    /// @notice Error thrown when reveal phase is closed
    error RevealPhaseClosed();
    /// @notice Error thrown when no prior commitment exists
    error NoCommit();
    /// @notice Error thrown when vote already revealed
    error AlreadyRevealed();
    /// @notice Error thrown when provided reveal data is invalid
    error InvalidReveal();
    /// @notice Error thrown when validator has no stake
    error NoStake();
    /// @notice Error thrown when results already tallied
    error AlreadyTallied();
    /// @notice Error thrown when reveal window has not elapsed
    error RevealPending();
    /// @notice Error thrown when parameter arrays have different lengths
    error LengthMismatch();

    /// @notice Emitted when validators are selected for a job
    /// @param jobId Identifier of the job
    /// @param validators List of selected validators
    event ValidatorsSelected(uint256 indexed jobId, address[] validators);
    /// @notice Emitted when a validator commits a vote
    /// @param jobId Identifier of the job
    /// @param validator Address of the validator
    /// @param commitHash Hash of the committed vote
    event VoteCommitted(uint256 indexed jobId, address indexed validator, bytes32 commitHash);
    /// @notice Emitted when a validator reveals a vote
    /// @param jobId Identifier of the job
    /// @param validator Address of the validator
    /// @param approve True if the validator approves the submission
    event VoteRevealed(uint256 indexed jobId, address indexed validator, bool approve);
    /// @notice Emitted when module parameters are updated
    event ParametersUpdated();

    /// @notice Select validators for a job
    /// @param jobId Identifier of the job
    /// @return Array of selected validator addresses
    function selectValidators(uint256 jobId) external returns (address[] memory);
    /// @notice Commit a hashed vote for a job
    /// @param jobId Identifier of the job
    /// @param commitHash Hash of the vote and salt
    function commitVote(uint256 jobId, bytes32 commitHash) external;
    /// @notice Reveal a previously committed vote
    /// @param jobId Identifier of the job
    /// @param approve True if the job is approved
    /// @param salt Salt used in the commit hash
    function revealVote(uint256 jobId, bool approve, bytes32 salt) external;
    /// @notice Tally votes for a job
    /// @param jobId Identifier of the job
    /// @return success True if approvals outweigh rejections
    function tally(uint256 jobId) external returns (bool success);

    /// @notice Owner configuration for timing and validator tiers
    /// @param commitWindow Duration of the commit phase
    /// @param revealWindow Duration of the reveal phase
    /// @param rewardTiers Reward thresholds used for validator counts
    /// @param validatorsPerTier Number of validators per reward tier
    function setParameters(
        uint256 commitWindow,
        uint256 revealWindow,
        uint256[] calldata rewardTiers,
        uint256[] calldata validatorsPerTier
    ) external;
}
