// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IValidationModule
/// @notice Interface for validator selection and commit-reveal voting
interface IValidationModule {
    /// @notice Module version for compatibility checks.
    function version() external view returns (uint256);

    enum SelectionStrategy {
        Rotating,
        Reservoir
    }
    event ValidatorsSelected(uint256 indexed jobId, address[] validators);
    event ValidationCommitted(uint256 indexed jobId, address indexed validator, bytes32 commitHash);
    event ValidationRevealed(uint256 indexed jobId, address indexed validator, bool approve);
    event ValidationTallied(
        uint256 indexed jobId,
        bool success,
        uint256 approvals,
        uint256 rejections
    );
    event ValidationResult(uint256 indexed jobId, bool success);
    event ValidatorSubdomainUpdated(address indexed validator, string subdomain);
    event SelectionStrategyUpdated(SelectionStrategy strategy);
    event ParametersUpdated(
        uint256 committeeSize,
        uint256 commitWindow,
        uint256 revealWindow,
        uint256 approvalThreshold,
        uint256 slashingPct
    );
    /// @notice Emitted after automation performs upkeep.
    /// @param jobId Identifier of the job finalized.
    /// @param success True if validation succeeded.
    event UpkeepPerformed(uint256 indexed jobId, bool success);

    /// @notice Select validators for a given job.
    /// @param jobId Identifier of the job.
    /// @param entropy Optional caller-provided entropy mixed with on-chain data.
    /// @return Array of selected validator addresses.
    function selectValidators(uint256 jobId, uint256 entropy)
        external
        returns (address[] memory);

    /// @notice Start validation for a job and select validators
    /// @param jobId Identifier of the job
    /// @param entropy Caller-provided entropy mixed with on-chain sources
    /// @return validators Array of selected validator addresses
    function start(
        uint256 jobId,
        uint256 entropy
    ) external returns (address[] memory validators);

    /// @notice Commit a validation hash for a job
    /// @param jobId Identifier of the job being voted on
    /// @param commitHash Hash of the vote and salt
    /// @param subdomain ENS subdomain label used for ownership verification
    /// @param proof Merkle proof validating the subdomain
    function commitValidation(
        uint256 jobId,
        bytes32 commitHash,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external;

    /// @notice Commit a validation hash without ENS parameters (legacy wrapper)
    function commitValidation(uint256 jobId, bytes32 commitHash) external;

    /// @notice Reveal a previously committed validation vote
    /// @param jobId Identifier of the job
    /// @param approve True to approve, false to reject
    /// @param salt Salt used in the original commitment
    /// @param subdomain ENS subdomain label used for ownership verification
    /// @param proof Merkle proof validating the subdomain
    function revealValidation(
        uint256 jobId,
        bool approve,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external;

    /// @notice Reveal a previously committed validation vote (legacy wrapper)
    function revealValidation(uint256 jobId, bool approve, bytes32 salt) external;

    /// @notice Finalize validation round and slash incorrect validators
    /// @param jobId Identifier of the job
    /// @return success True if validators approved the job
    function finalize(uint256 jobId) external returns (bool success);

    /// @notice Alias for finalize using legacy naming.
    function finalizeValidation(uint256 jobId) external returns (bool success);

    /// @notice Check if automation should finalize a job.
    /// @param checkData ABI encoded jobId.
    /// @return upkeepNeeded True if `performUpkeep` should be called.
    /// @return performData Data to pass to `performUpkeep`.
    function checkUpkeep(bytes calldata checkData)
        external
        view
        returns (bool upkeepNeeded, bytes memory performData);

    /// @notice Perform automated finalization.
    /// @param performData ABI encoded jobId produced by `checkUpkeep`.
    function performUpkeep(bytes calldata performData) external;

    /// @notice Batch update core validation parameters
    /// @param committeeSize Number of validators selected per job
    /// @param commitWindow Duration of commit phase in seconds
    /// @param revealWindow Duration of reveal phase in seconds
    /// @param approvalThreshold Percentage of stake required for approval
    /// @param slashingPct Percentage of stake slashed for incorrect votes
    function setParameters(
        uint256 committeeSize,
        uint256 commitWindow,
        uint256 revealWindow,
        uint256 approvalThreshold,
        uint256 slashingPct
    ) external;

    /// @notice Set the number of validators selected per job.
    function setValidatorsPerJob(uint256 count) external;

    /// @notice Owner configuration for timing windows
    function setCommitRevealWindows(uint256 commitWindow, uint256 revealWindow) external;

    /// @notice Convenience wrapper for timing configuration.
    function setTiming(uint256 commitWindow, uint256 revealWindow) external;

    /// @notice Owner configuration for validator counts
    function setValidatorBounds(uint256 minValidators, uint256 maxValidators) external;

    /// @notice Set the required number of validator approvals.
    function setRequiredValidatorApprovals(uint256 count) external;

    /// @notice Reset the validation nonce for a job after it is finalized or disputed
    /// @param jobId Identifier of the job
    function resetJobNonce(uint256 jobId) external;

    /// @notice Update approval threshold percentage
    function setApprovalThreshold(uint256 pct) external;

    /// @notice Update percentage of stake slashed for incorrect validator votes
    function setValidatorSlashingPct(uint256 pct) external;

    /// @notice Map validators to ENS subdomains for selection
    function setValidatorSubdomains(
        address[] calldata accounts,
        string[] calldata subdomains
    ) external;

    /// @notice Configure the validator sampling strategy.
    function setSelectionStrategy(SelectionStrategy strategy) external;

    /// @notice Return validators selected for a job
    /// @param jobId Identifier of the job
    /// @return validators Array of validator addresses
    function validators(uint256 jobId) external view returns (address[] memory validators);

    /// @notice Retrieve a validator's vote outcome for a job
    /// @param jobId Identifier of the job
    /// @param validator Address of the validator
    /// @return approved True if the validator approved the job
    function votes(
        uint256 jobId,
        address validator
    ) external view returns (bool approved);
}

