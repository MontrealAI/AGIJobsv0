// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IERC20Burnable
/// @notice Minimal interface for ERC20 tokens with burn capability
interface IERC20Burnable {
    /// @notice Burn `amount` tokens from the caller's balance.
    /// @param amount token amount to burn
    function burn(uint256 amount) external;

    /// @notice Burn `amount` tokens from `account` using allowance.
    /// @param account source of tokens to burn
    /// @param amount token amount to burn
    function burnFrom(address account, uint256 amount) external;
}

