// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IValidationModule
/// @notice Interface for validator selection, commit-reveal voting, and outcome resolution
interface IValidationModule {
    event ValidatorsSelected(uint256 indexed jobId, address[] validators);
    event ValidationCommitted(uint256 indexed jobId, address indexed validator, bytes32 commitHash);
    event ValidationRevealed(uint256 indexed jobId, address indexed validator, bool approve);

    function selectValidators(uint256 jobId) external returns (address[] memory);
    function commitValidation(uint256 jobId, bytes32 commitHash) external;
    function revealValidation(uint256 jobId, bool approve, bytes32 salt) external;
    function finalize(uint256 jobId) external returns (bool success);
}

