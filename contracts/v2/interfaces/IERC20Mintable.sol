// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IERC20Mintable
/// @notice Minimal interface for ERC20 tokens with mint and burn capabilities.
interface IERC20Mintable {
    /// @notice Mint `amount` tokens to `to`.
    /// @param to recipient address
    /// @param amount token amount to mint
    function mint(address to, uint256 amount) external;

    /// @notice Burn `amount` tokens from `from`.
    /// @param from address whose tokens will be burned
    /// @param amount token amount to burn
    function burn(address from, uint256 amount) external;
}

