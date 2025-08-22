// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IENS} from "./interfaces/IENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";

/// @title Resolver interface
/// @notice Minimal interface to query addresses from ENS records.
interface IResolver {
    /// @notice Get the address associated with an ENS node.
    /// @param node The ENS node hash.
    /// @return resolvedAddress The resolved payable address for `node`.
    function addr(bytes32 node) external view returns (address payable resolvedAddress);
}

/// @title ENSIdentityVerifier
/// @notice Library providing ENS ownership verification via Merkle proofs,
/// NameWrapper, and resolver lookups. Emits events on success or recovery
/// conditions.
library ENSIdentityVerifier {
    event OwnershipVerified(address indexed claimant, string subdomain);
    event RecoveryInitiated(string reason);

    function checkOwnership(
        IENS ens,
        INameWrapper nameWrapper,
        bytes32 rootNode,
        bytes32 merkleRoot,
        address claimant,
        string memory subdomain,
        bytes32[] calldata proof
    ) internal view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(claimant));
        if (MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) {
            return true;
        }
        bytes32 subnode = keccak256(
            abi.encodePacked(rootNode, keccak256(bytes(subdomain)))
        );
        try nameWrapper.ownerOf(uint256(subnode)) returns (address actualOwner) {
            if (actualOwner == claimant) {
                return true;
            }
        } catch {}

        address resolverAddr = ens.resolver(subnode);
        if (resolverAddr != address(0)) {
            try IResolver(resolverAddr).addr(subnode) returns (
                address payable resolvedAddress
            ) {
                if (resolvedAddress == claimant) {
                    return true;
                }
            } catch {}
        }
        return false;
    }

    function verifyOwnership(
        IENS ens,
        INameWrapper nameWrapper,
        bytes32 rootNode,
        bytes32 merkleRoot,
        address claimant,
        string memory subdomain,
        bytes32[] calldata proof
    ) internal returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(claimant));
        if (MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) {
            emit OwnershipVerified(claimant, subdomain);
            return true;
        }
        bytes32 subnode = keccak256(
            abi.encodePacked(rootNode, keccak256(bytes(subdomain)))
        );
        bool eventEmitted;
        try nameWrapper.ownerOf(uint256(subnode)) returns (address actualOwner) {
            if (actualOwner == claimant) {
                emit OwnershipVerified(claimant, subdomain);
                return true;
            }
        } catch Error(string memory reason) {
            emit RecoveryInitiated(reason);
            eventEmitted = true;
        } catch {
            emit RecoveryInitiated(
                "NameWrapper call failed without a specified reason."
            );
            eventEmitted = true;
        }

        address resolverAddr = ens.resolver(subnode);
        if (resolverAddr != address(0)) {
            IResolver resolver = IResolver(resolverAddr);
            try resolver.addr(subnode) returns (
                address payable resolvedAddress
            ) {
                if (resolvedAddress == claimant) {
                    emit OwnershipVerified(claimant, subdomain);
                    return true;
                }
                if (!eventEmitted) {
                    emit RecoveryInitiated("Resolver address mismatch.");
                    eventEmitted = true;
                }
            } catch {
                if (!eventEmitted) {
                    emit RecoveryInitiated(
                        "Resolver call failed without a specified reason."
                    );
                    eventEmitted = true;
                }
            }
        } else {
            if (!eventEmitted) {
                emit RecoveryInitiated("Resolver address not found for node.");
                eventEmitted = true;
            }
        }

        if (!eventEmitted) {
            emit RecoveryInitiated("Ownership verification failed.");
        }
        return false;
    }
}

