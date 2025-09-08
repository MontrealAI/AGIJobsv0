// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IENS} from "../interfaces/IENS.sol";
import {INameWrapper} from "../interfaces/INameWrapper.sol";
import {IAddrResolver} from "../interfaces/IAddrResolver.sol";

/// @title Ownership verification helpers
/// @notice Library computing ENS ownership through Merkle proofs and on-chain checks.
library VerifyOwnership {
    /// @notice Verify that `claimant` controls `subdomain` under `rootNode`.
    /// @param claimant Address claiming ownership.
    /// @param subdomain ENS label owned by the claimant.
    /// @param proof Merkle proof for off-chain allowlists.
    /// @param rootNode ENS root node being checked against.
    /// @param clubRootNode Root node for validator clubs.
    /// @param agentRootNode Root node for agents.
    /// @param validatorMerkleRoot Merkle root for validator allowlist.
    /// @param agentMerkleRoot Merkle root for agent allowlist.
    /// @param ens ENS registry used for resolver lookups.
    /// @param nameWrapper ENS NameWrapper used for ownership checks.
    /// @return success True if ownership is verified.
    /// @return reason Optional recovery reason when lookups fail.
    function verifyOwnership(
        address claimant,
        string memory subdomain,
        bytes32[] calldata proof,
        bytes32 rootNode,
        bytes32 clubRootNode,
        bytes32 agentRootNode,
        bytes32 validatorMerkleRoot,
        bytes32 agentMerkleRoot,
        IENS ens,
        INameWrapper nameWrapper
    ) internal view returns (bool success, string memory reason) {
        bytes32 labelHash = keccak256(bytes(subdomain));
        bytes32 leaf = keccak256(abi.encode(claimant, labelHash));
        bytes32 merkleRoot;
        if (rootNode == clubRootNode) {
            merkleRoot = validatorMerkleRoot;
        } else if (rootNode == agentRootNode) {
            merkleRoot = agentMerkleRoot;
        } else {
            return (false, reason);
        }
        if (MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) {
            return (true, reason);
        }
        bytes32 subnode = keccak256(abi.encodePacked(rootNode, labelHash));
        try nameWrapper.ownerOf(uint256(subnode)) returns (address actualOwner) {
            if (actualOwner == claimant) {
                return (true, reason);
            }
        } catch Error(string memory err) {
            return (false, err);
        } catch {
            return (false, "NameWrapper call failed without a specified reason.");
        }
        address resolverAddr = ens.resolver(subnode);
        if (resolverAddr != address(0)) {
            IAddrResolver resolver = IAddrResolver(resolverAddr);
            try resolver.addr(subnode) returns (address resolved) {
                if (resolved == claimant) {
                    return (true, reason);
                }
            } catch {
                return (false, "Resolver call failed without a specified reason.");
            }
        } else {
            return (false, "Resolver address not found for node.");
        }
        return (false, reason);
    }
}

