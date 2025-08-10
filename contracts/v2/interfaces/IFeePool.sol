// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IFeePool
/// @notice Minimal interface for depositing job fees
interface IFeePool {
    /// @notice notify the pool about newly received fees
    /// @param amount amount of tokens transferred to the pool scaled to 6 decimals
    function depositFee(uint256 amount) external;
}
