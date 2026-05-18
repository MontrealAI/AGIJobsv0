// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title MockNameWrapper
/// @notice Minimal ENS NameWrapper mock exposing ownership, fuses, and expiry for testing.
contract MockNameWrapper {
    struct NameData {
        address owner;
        uint32 fuses;
        uint64 expiry;
    }

    mapping(uint256 => NameData) private _nameData;

    event NameUpdated(uint256 indexed node, address owner, uint32 fuses, uint64 expiry);

    /// @notice Return wrapper metadata for a node.
    /// @param node Namehash for the ENS name.
    /// @return owner Owner address recorded in the wrapper.
    /// @return fuses Fuse bitmask assigned to the name.
    /// @return expiry Expiry timestamp for the name.
    function getData(uint256 node) external view returns (address owner, uint32 fuses, uint64 expiry) {
        NameData memory data = _nameData[node];
        return (data.owner, data.fuses, data.expiry);
    }

    /// @notice Return the owner for an ENS node stored by the wrapper.
    /// @param node Namehash for the ENS name.
    /// @return Owner address (zero address for unwrapped names).
    function ownerOf(uint256 node) external view returns (address) {
        return _nameData[node].owner;
    }

    /// @notice Configure wrapper metadata for a node.
    /// @dev Default values remain zero to emulate unwrapped names.
    /// @param node Namehash for the ENS name.
    /// @param owner Owner address to set.
    /// @param fuses Fuse bitmask to store.
    /// @param expiry Expiry timestamp for the name.
    function setData(uint256 node, address owner, uint32 fuses, uint64 expiry) public {
        _nameData[node] = NameData(owner, fuses, expiry);
        emit NameUpdated(node, owner, fuses, expiry);
    }

    /// @notice Convenience helper mirroring legacy mock behaviour.
    /// @param node Namehash for the ENS name.
    /// @param owner Owner address to set with zeroed fuses and expiry.
    function setOwner(uint256 node, address owner) external {
        setData(node, owner, 0, 0);
    }
}
