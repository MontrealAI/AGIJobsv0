// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IFeePool
/// @notice Minimal interface for depositing job fees
interface IFeePool {
    /// @notice notify the pool about newly received fees
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
}
