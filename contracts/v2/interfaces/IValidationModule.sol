// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IValidationModule
/// @notice Interface for validator selection and commit-reveal voting
interface IValidationModule {
    event ValidatorsSelected(uint256 indexed jobId, address[] validators);
    event ValidationCommitted(uint256 indexed jobId, address indexed validator, bytes32 commitHash);
    event ValidationRevealed(uint256 indexed jobId, address indexed validator, bool approve);
    event ValidationFinalized(
        uint256 indexed jobId,
        bool success,
        uint256 approvals,
        uint256 rejections
    );
    event ValidatorSubdomainUpdated(address indexed validator, string subdomain);

    /// @notice Select validators for a given job
    /// @param jobId Identifier of the job
    /// @return Array of selected validator addresses
    function selectValidators(uint256 jobId) external returns (address[] memory);

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

    /// @notice Finalize validation round and slash incorrect validators
    /// @param jobId Identifier of the job
    /// @return success True if validators approved the job
    function finalize(uint256 jobId) external returns (bool success);

    /// @notice Owner configuration for timing windows
    function setCommitRevealWindows(uint256 commitWindow, uint256 revealWindow) external;

    /// @notice Owner configuration for validator counts
    function setValidatorBounds(uint256 minValidators, uint256 maxValidators) external;

    /// @notice Reset the validation nonce for a job after it is finalized or disputed
    /// @param jobId Identifier of the job
    function resetJobNonce(uint256 jobId) external;

    /// @notice Update approval threshold percentage
    function setApprovalThreshold(uint256 pct) external;

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

