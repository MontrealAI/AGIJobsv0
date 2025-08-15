// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title INameWrapper
/// @notice Minimal interface to check ownership of wrapped ENS names.
interface INameWrapper {
    /// @notice Get the owner of a wrapped ENS name.
    /// @param id The namehash of the ENS name.
    /// @return owner Address of the owner.
    function ownerOf(uint256 id) external view returns (address owner);
}
