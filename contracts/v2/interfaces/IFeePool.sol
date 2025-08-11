// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IFeePool
/// @notice Minimal interface for depositing job fees
interface IFeePool {
    /// @notice notify the pool about newly received fees
    /// @param amount amount of tokens transferred to the pool scaled to 6 decimals
    function depositFee(uint256 amount) external;

    /// @notice distribute pending fees to stakers
    function distributeFees() external;

    /// @notice claim accumulated rewards for caller
    function claimRewards() external;

    /// @notice transfer tokens from the pool to a recipient
    /// @param to address receiving the tokens
    /// @param amount token amount with 6 decimals
    function transferReward(address to, uint256 amount) external;
}
