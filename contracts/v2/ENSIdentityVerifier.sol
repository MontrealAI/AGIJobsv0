// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IENS} from "./interfaces/IENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import {IAddrResolver} from "./interfaces/IAddrResolver.sol";

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
    )
        internal
        view
        returns (bool ok, bytes32 subnode, bool viaWrapper, bool viaMerkle)
    {
        bytes32 labelHash = keccak256(bytes(subdomain));
        subnode = keccak256(abi.encodePacked(rootNode, labelHash));
        bytes32 leaf = keccak256(abi.encode(claimant, labelHash));
        if (MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) {
            return (true, subnode, false, true);
        }
        try nameWrapper.ownerOf(uint256(subnode)) returns (address actualOwner) {
            if (actualOwner == claimant) {
                return (true, subnode, true, false);
            }
        } catch {}

        if (address(ens) != address(0)) {
            address resolverAddr = ens.resolver(subnode);
            if (resolverAddr != address(0)) {
                try IAddrResolver(resolverAddr).addr(subnode) returns (
                    address resolvedAddress
                ) {
                    if (resolvedAddress == claimant) {
                        return (true, subnode, false, false);
                    }
                } catch {}
            }
        }
        return (false, subnode, false, false);
    }

    function verifyOwnership(
        IENS ens,
        INameWrapper nameWrapper,
        bytes32 rootNode,
        bytes32 merkleRoot,
        address claimant,
        string memory subdomain,
        bytes32[] calldata proof
    )
        internal
        returns (bool ok, bytes32 subnode, bool viaWrapper, bool viaMerkle)
    {
        bytes32 labelHash = keccak256(bytes(subdomain));
        subnode = keccak256(abi.encodePacked(rootNode, labelHash));
        bytes32 leaf = keccak256(abi.encode(claimant, labelHash));
        if (MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) {
            emit OwnershipVerified(claimant, subdomain);
            return (true, subnode, false, true);
        }
        bool eventEmitted;
        try nameWrapper.ownerOf(uint256(subnode)) returns (address actualOwner) {
            if (actualOwner == claimant) {
                emit OwnershipVerified(claimant, subdomain);
                return (true, subnode, true, false);
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

        if (address(ens) != address(0)) {
            address resolverAddr = ens.resolver(subnode);
            if (resolverAddr != address(0)) {
                IAddrResolver resolver = IAddrResolver(resolverAddr);
                try resolver.addr(subnode) returns (
                    address resolvedAddress
                ) {
                    if (resolvedAddress == claimant) {
                        emit OwnershipVerified(claimant, subdomain);
                        return (true, subnode, false, false);
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
        } else {
            if (!eventEmitted) {
                emit RecoveryInitiated("ENS not configured.");
                eventEmitted = true;
            }
        }

        if (!eventEmitted) {
            emit RecoveryInitiated("Ownership verification failed.");
        }
        return (false, subnode, false, false);
    }
}

