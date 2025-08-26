// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

/// @title RevertingNameWrapper
/// @notice Mock NameWrapper that always reverts.
contract RevertingNameWrapper {
    function ownerOf(uint256) external pure returns (address) {
        revert("revert");
    }
}
