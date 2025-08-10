// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IStakeManager
/// @notice Interface for handling token collateral for agents and validators
/// @dev Amounts are expressed using 6‑decimal scaling (1 token = 1e6 units).
///      For example `3` tokens should be provided as `3_000_000`. Contracts
///      working with 18‑decimal tokens need to divide by `1e12` and may lose
///      precision.
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
        address indexed employer,
        address treasury
    );
    event TokenUpdated(address token);
    event ParametersUpdated();

    /// @dev Reverts when user does not have enough available stake
    error InsufficientStake(
        address user,
        Role role,
        uint256 available,
        uint256 required
    );

    /// @dev Reverts when attempting to withdraw stake that is locked
    error StakeCurrentlyLocked(address user, Role role, uint256 lockedAmount);

    /// @dev Reverts when caller is not authorised for privileged operations
    error NotAuthorised(address caller);

    /// @notice Deposit tokens as stake for a specific role
    /// @param role Role of the participant depositing stake
    /// @param amount Amount of tokens to deposit
    function depositStake(Role role, uint256 amount) external;

    /// @notice Withdraw available stake for a specific role
    /// @param role Role of the participant withdrawing stake
    /// @param amount Amount of tokens to withdraw
    /// @dev Reverts with {StakeCurrentlyLocked} if attempting to withdraw locked funds
    function withdrawStake(Role role, uint256 amount) external;

    /// @notice Lock a user's stake for job execution or validation
    /// @param user Address whose stake will be locked
    /// @param role Role of the participant whose stake is locked
    /// @param amount Amount of tokens to lock
    /// @dev Reverts with {InsufficientStake} if available stake is too low
    ///      or {NotAuthorised} if caller lacks permission
    function lockStake(address user, Role role, uint256 amount) external;

    /// @notice Slash a user's stake and transfer it to an employer and treasury
    /// @param user Address whose stake is slashed
    /// @param role Role associated with the stake
    /// @param amount Amount of tokens to slash
    /// @param employer Employer receiving a portion of the slashed stake
    /// @dev Reverts with {InsufficientStake} or {NotAuthorised} as appropriate
    function slash(
        address user,
        Role role,
        uint256 amount,
        address employer
    ) external;

    /// @notice Return the total stake deposited by a user for a role
    /// @param user Address to query
    /// @param role Role for which stake is queried
    /// @return Amount of stake deposited
    function stakeOf(address user, Role role) external view returns (uint256);

    /// @notice Return the locked portion of a user's stake
    /// @param user Address to query
    /// @param role Role for which locked stake is queried
    /// @return Amount of stake currently locked
    function lockedStakeOf(address user, Role role) external view returns (uint256);

    /// @notice Owner functions

    /// @notice Set the ERC20 token used for staking
    /// @param token Address of the staking token
    function setToken(address token) external;

    /// @notice Configure stake and slashing parameters
    /// @param agentStakePercentage Percentage of reward required as agent stake
    /// @param validatorStakePercentage Percentage required for validators
    /// @param agentSlashingPercentage Percentage of agent stake to slash
    /// @param validatorSlashingPercentage Percentage of validator stake to slash
    function setStakeParameters(
        uint256 agentStakePercentage,
        uint256 validatorStakePercentage,
        uint256 agentSlashingPercentage,
        uint256 validatorSlashingPercentage
    ) external;
}

