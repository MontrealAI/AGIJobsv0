// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title ENSAuthorizer
 * @notice Validates that an address controls an authorised ENS subdomain for a specific role.
 *         Uses Merkle proofs published by governance to avoid trusting off-chain registries.
 */
contract ENSAuthorizer is Ownable {
    enum Role {
        Validator,
        Agent,
        Node
    }

    event RootUpdated(Role indexed role, bool indexed isAlpha, bytes32 root, string description);

    error UnknownRoot(Role role, bool isAlpha);
    error InvalidProof();

    mapping(bytes32 => bytes32) private _roots;

    constructor() Ownable(msg.sender) {}

    function setRoot(Role role, bool isAlpha, bytes32 root, string calldata description) external onlyOwner {
        bytes32 key = _rootKey(role, isAlpha);
        _roots[key] = root;
        emit RootUpdated(role, isAlpha, root, description);
    }

    function getRoot(Role role, bool isAlpha) external view returns (bytes32) {
        return _roots[_rootKey(role, isAlpha)];
    }

    function verify(
        address claimant,
        bytes32 namehash,
        Role role,
        bool isAlpha,
        bytes32[] calldata merkleProof
    ) public view returns (bool) {
        bytes32 root = _roots[_rootKey(role, isAlpha)];
        if (root == bytes32(0)) {
            revert UnknownRoot(role, isAlpha);
        }
        bytes32 leaf = keccak256(abi.encodePacked(claimant, namehash));
        if (!MerkleProof.verifyCalldata(merkleProof, root, leaf)) {
            revert InvalidProof();
        }
        return true;
    }

    function _rootKey(Role role, bool isAlpha) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(role, isAlpha));
    }
}
