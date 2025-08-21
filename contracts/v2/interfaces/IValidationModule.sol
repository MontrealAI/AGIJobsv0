// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IValidationModule
/// @notice Interface for validator selection and commit-reveal voting
interface IValidationModule {
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

    /// @notice Select validators for a given job
    /// @param jobId Identifier of the job
    /// @return Array of selected validator addresses
    function selectValidators(uint256 jobId) external returns (address[] memory);

    /// @notice Start validation by selecting validators for a job
    /// @param jobId Identifier of the job
    /// @param result Submitted job result to be validated
    /// @return validators Array of selected validator addresses
    function startValidation(uint256 jobId, string calldata result)
        external
        returns (address[] memory validators);

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

    /// @notice Owner configuration for timing windows
    function setCommitRevealWindows(uint256 commitWindow, uint256 revealWindow) external;

    /// @notice Convenience wrapper for timing configuration.
    function setTiming(uint256 commitWindow, uint256 revealWindow) external;

    /// @notice Owner configuration for validator counts
    function setValidatorBounds(uint256 minValidators, uint256 maxValidators) external;

    /// @notice Reset the validation nonce for a job after it is finalized or disputed
    /// @param jobId Identifier of the job
    function resetJobNonce(uint256 jobId) external;

    /// @notice Update approval threshold percentage
    function setApprovalThreshold(uint256 pct) external;

    /// @notice Update percentage of stake slashed for incorrect validator votes
    function setValidatorSlashingPct(uint256 pct) external;

    /// @notice Manually allow a validator to bypass ENS checks.
    function addAdditionalValidator(address validator) external;

    /// @notice Remove a validator from the manual allowlist.
    function removeAdditionalValidator(address validator) external;

    /// @notice Update ENS root nodes for agents and validators.
    function setENSRoots(bytes32 agentRoot, bytes32 clubRoot) external;

    /// @notice Update Merkle roots for agents and validators.
    function setMerkleRoots(bytes32 agentRoot, bytes32 validatorRoot) external;

    /// @notice Map validators to ENS subdomains for selection
    function setValidatorSubdomains(
        address[] calldata accounts,
        string[] calldata subdomains
    ) external;

    /// @notice Return validators selected for a job
    /// @param jobId Identifier of the job
    /// @return validators Array of validator addresses
    function validators(uint256 jobId) external view returns (address[] memory validators);
}

