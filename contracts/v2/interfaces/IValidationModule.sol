// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IValidationModule
/// @notice Interface for validator selection, commit-reveal voting, and outcome resolution
interface IValidationModule {
    event ValidatorsSelected(uint256 indexed jobId, address[] validators);
    event ValidationCommitted(uint256 indexed jobId, address indexed validator, bytes32 commitHash);
    event ValidationRevealed(uint256 indexed jobId, address indexed validator, bool approve);
    event ValidationAppealed(uint256 indexed jobId, address indexed caller);
    event ParametersUpdated();

    function selectValidators(uint256 jobId) external returns (address[] memory);
    function commitValidation(uint256 jobId, bytes32 commitHash) external;
    function revealValidation(uint256 jobId, bool approve, bytes32 salt) external;
    function finalize(uint256 jobId) external returns (bool success);
    function appeal(uint256 jobId) external payable;

    /// @notice Owner configuration for stake and timing parameters
    /// @dev Only callable by contract owner
    function setParameters(
        uint256 validatorStakeRequirement,
        uint256 validatorStakePercentage,
        uint256 validatorRewardPercentage,
        uint256 validatorSlashingPercentage,
        uint256 commitDuration,
        uint256 revealDuration,
        uint256 reviewWindow,
        uint256 resolveGracePeriod,
        uint256 validatorsPerJob
    ) external;
}

