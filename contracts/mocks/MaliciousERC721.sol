// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

/// @notice Minimal ERC721-like contract that reverts on balanceOf to simulate malicious behavior.
contract MaliciousERC721 {
    function balanceOf(address) external pure returns (uint256) {
        revert("malicious");
    }
}
