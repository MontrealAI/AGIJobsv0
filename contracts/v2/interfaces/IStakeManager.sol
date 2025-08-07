// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IStakeManager
/// @notice Interface for handling token collateral for agents and validators
interface IStakeManager {
    enum Role {
        Agent,
        Validator
    }

    event StakeDeposited(address indexed user, Role indexed role, uint256 amount);
    event StakeWithdrawn(address indexed user, Role indexed role, uint256 amount);
    event StakeLocked(address indexed user, Role indexed role, uint256 amount);
    event StakeSlashed(
        address indexed user,
        Role indexed role,
        uint256 amount,
        address indexed recipient
    );
    event TokenUpdated(address token);
    event ParametersUpdated();

    function depositStake(Role role, uint256 amount) external;
    function withdrawStake(Role role, uint256 amount) external;
    function lockStake(address user, Role role, uint256 amount) external;
    function slash(address user, uint256 amount, address recipient) external;

    function agentStake(address agent) external view returns (uint256);
    function validatorStake(address validator) external view returns (uint256);
    function lockedAgentStake(address agent) external view returns (uint256);
    function lockedValidatorStake(address validator) external view returns (uint256);

    /// @notice Owner functions
    function setToken(address token) external;
    function setStakeParameters(
        uint256 agentStakePercentage,
        uint256 validatorStakePercentage,
        uint256 validatorSlashingPercentage
    ) external;
}

