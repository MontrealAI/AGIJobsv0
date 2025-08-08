// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IValidationModule
/// @notice Interface for validator selection and commit-reveal voting
interface IValidationModule {
    event ValidatorsSelected(uint256 indexed jobId, address[] validators);
    event VoteCommitted(uint256 indexed jobId, address indexed validator, bytes32 commitHash);
    event VoteRevealed(uint256 indexed jobId, address indexed validator, bool approve);
    event ParametersUpdated();

    function selectValidators(uint256 jobId) external returns (address[] memory);
    function commitVote(uint256 jobId, bytes32 commitHash) external;
    function revealVote(uint256 jobId, bool approve, bytes32 salt) external;
    function tally(uint256 jobId) external returns (bool success);

    /// @notice Owner configuration for timing and committee size
    function setParameters(
        uint256 commitWindow,
        uint256 revealWindow,
        uint256 validatorsPerJob
    ) external;
}
