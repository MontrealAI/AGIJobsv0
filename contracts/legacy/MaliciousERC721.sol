// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

/// @notice Minimal ERC721-like contract that reverts on balanceOf to simulate malicious behavior.
contract MaliciousERC721 {
    function balanceOf(address) external pure returns (uint256) {
        revert("malicious");
    }
}
