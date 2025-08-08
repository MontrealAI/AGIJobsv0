// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IStakeManager
/// @notice Interface for handling token collateral for agents and validators
interface IStakeManager {
    enum Role {
        Agent,
        Validator
    }

    /// @notice Error thrown when a zero amount is provided
    error AmountZero();
    /// @notice Error thrown when user has insufficient available stake
    error InsufficientStake();
    /// @notice Error thrown when requested amount is below the minimum required
    error BelowMinimumStake();
    /// @notice Error thrown when locked stake is insufficient
    error InsufficientLockedStake();

    /// @notice Emitted when stake is deposited
    /// @param user Address of the staker
    /// @param role Role the stake is credited to
    /// @param amount Amount deposited
    event StakeDeposited(address indexed user, Role indexed role, uint256 amount);
    /// @notice Emitted when stake is withdrawn
    /// @param user Address of the staker
    /// @param role Role the stake is withdrawn from
    /// @param amount Amount withdrawn
    event StakeWithdrawn(address indexed user, Role indexed role, uint256 amount);
    /// @notice Emitted when stake is locked
    /// @param user Address whose stake is locked
    /// @param role Role of the stake being locked
    /// @param amount Amount locked
    event StakeLocked(address indexed user, Role indexed role, uint256 amount);
    /// @notice Emitted when stake is slashed
    /// @param user Address whose stake is slashed
    /// @param role Role of the stake
    /// @param amount Amount slashed
    /// @param employer Recipient of the slashed amount
    /// @param treasury Treasury address receiving remaining amount
    event StakeSlashed(
        address indexed user,
        Role indexed role,
        uint256 amount,
        address indexed employer,
        address treasury
    );
    /// @notice Emitted when the staking token address changes
    /// @param token New token address
    event TokenUpdated(address token);
    /// @notice Emitted when staking parameters are updated
    event ParametersUpdated();

    /// @notice Deposit stake for a given role
    /// @param role Role to credit stake
    /// @param amount Amount to deposit
    function depositStake(Role role, uint256 amount) external;
    /// @notice Withdraw unlocked stake
    /// @param role Role to withdraw from
    /// @param amount Amount to withdraw
    function withdrawStake(Role role, uint256 amount) external;
    /// @notice Lock a user's stake
    /// @param user Address whose stake is locked
    /// @param role Role of the stake
    /// @param amount Amount to lock
    function lockStake(address user, Role role, uint256 amount) external;
    /// @notice Slash a user's locked stake
    /// @param user Address whose stake is slashed
    /// @param role Role of the stake
    /// @param amount Amount to slash
    /// @param employer Recipient of the slashed funds
    function slash(address user, Role role, uint256 amount, address employer) external;

    /// @notice Retrieve total stake for a user and role
    function stakeOf(address user, Role role) external view returns (uint256);
    /// @notice Retrieve locked stake for a user and role
    function lockedStakeOf(address user, Role role) external view returns (uint256);

    /// @notice Update the staking token address
    /// @param token Address of the new token
    function setToken(address token) external;
    /// @notice Set minimum stakes and slashing percentages for both roles
    /// @param agentStakePercentage Minimum stake for agents
    /// @param validatorStakePercentage Minimum stake for validators
    /// @param agentSlashingPercentage Slashing percentage for agents
    /// @param validatorSlashingPercentage Slashing percentage for validators
    function setStakeParameters(
        uint256 agentStakePercentage,
        uint256 validatorStakePercentage,
        uint256 agentSlashingPercentage,
        uint256 validatorSlashingPercentage
    ) external;
}

