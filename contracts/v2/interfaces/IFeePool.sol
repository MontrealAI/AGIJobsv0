// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IFeePool
/// @notice Minimal interface for depositing job fees
interface IFeePool {
    /// @notice contract version for compatibility checks
    function version() external view returns (uint256);

    /// @notice notify the pool about newly received fees
    /// @dev The pool burns the configured percentage and escrows the remainder for stakers.
    /// @param amount amount of tokens transferred to the pool scaled to 18 decimals
    function depositFee(uint256 amount) external;

    /// @notice distribute pending fees to stakers
    /// @dev All fee amounts use 18 decimal units.
    function distributeFees() external;

    /// @notice claim accumulated rewards for caller
    /// @dev Rewards use 18 decimal units.
    function claimRewards() external;

    /// @notice governance-controlled emergency withdrawal of tokens from the pool
    /// @dev Amount uses 18 decimal units.
    /// @param to address receiving the tokens
    /// @param amount token amount with 18 decimals
    function governanceWithdraw(address to, uint256 amount) external;

    /// @notice Transfer reward tokens to a recipient.
    /// @param to address receiving the reward
    /// @param amount token amount with 18 decimals
    function reward(address to, uint256 amount) external;
}
