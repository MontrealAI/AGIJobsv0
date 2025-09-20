// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title MockENSRegistry
/// @notice Minimal ENS registry mock for local migrations and tests.
contract MockENSRegistry {
    mapping(bytes32 => address) private _owners;

    event NewOwner(bytes32 indexed node, address owner);
    event Transfer(bytes32 indexed node, address owner);

    constructor() {
        _owners[bytes32(0)] = msg.sender;
    }

    /// @notice Get the owner of a node.
    /// @param node ENS namehash.
    /// @return Owner address.
    function owner(bytes32 node) external view returns (address) {
        return _owners[node];
    }

    /// @notice Set the owner of a node.
    /// @param node ENS namehash being updated.
    /// @param newOwner Address of the new owner.
    function setOwner(bytes32 node, address newOwner) external {
        address currentOwner = _owners[node];
        require(msg.sender == currentOwner, "MockENSRegistry: not owner");
        _owners[node] = newOwner;
        emit Transfer(node, newOwner);
    }

    /// @notice Set the owner of a subnode (label under an ENS node).
    /// @param node Parent node namehash.
    /// @param label Label hash for the subnode.
    /// @param newOwner Address of the new owner.
    /// @return subnode Namehash of the resulting subnode.
    function setSubnodeOwner(bytes32 node, bytes32 label, address newOwner) external returns (bytes32 subnode) {
        require(msg.sender == _owners[node], "MockENSRegistry: not parent owner");
        subnode = keccak256(abi.encodePacked(node, label));
        _owners[subnode] = newOwner;
        emit NewOwner(subnode, newOwner);
    }
}
