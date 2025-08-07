// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IStakeManager
/// @notice Interface for handling token collateral for agents and validators
interface IStakeManager {
    event StakeDeposited(address indexed user, uint256 amount);
    event StakeWithdrawn(address indexed user, uint256 amount);
    event StakeSlashed(address indexed user, uint256 amount, address indexed recipient);
    event TokenUpdated(address token);
    event ParametersUpdated();

    function depositAgentStake(address agent, uint256 amount) external;
    function depositValidatorStake(address validator, uint256 amount) external;
    function withdrawStake(uint256 amount) external;
    function slash(address user, uint256 amount, address recipient) external;
    function agentStake(address agent) external view returns (uint256);
    function validatorStake(address validator) external view returns (uint256);

    /// @notice Owner functions
    function setToken(address token) external;
    function setStakeParameters(
        uint256 agentStakeRequirement,
        uint256 validatorStakeRequirement,
        uint256 agentSlashingPercentage,
        uint256 validatorSlashingPercentage
    ) external;
}

