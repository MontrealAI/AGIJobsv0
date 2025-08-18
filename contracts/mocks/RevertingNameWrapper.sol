// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title RevertingNameWrapper
/// @notice Mock NameWrapper that always reverts.
contract RevertingNameWrapper {
    function ownerOf(uint256) external pure returns (address) {
        revert("revert");
    }
}
