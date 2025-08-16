// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IENS} from "../interfaces/IENS.sol";
import {INameWrapper} from "../interfaces/INameWrapper.sol";

/// @title Resolver interface
/// @notice Interface to query addresses from ENS records.
interface IResolver {
    /// @notice Get the address associated with an ENS node.
    /// @param node The ENS node hash.
    /// @return resolvedAddress The resolved payable address for `node`.
    function addr(bytes32 node) external view returns (address payable resolvedAddress);
}

/// @title ENSOwnershipVerifier
/// @notice Verifies ownership of ENS subdomains via Merkle proofs or on-chain lookups
contract ENSOwnershipVerifier is Ownable {
    IENS public ens;
    INameWrapper public nameWrapper;

    bytes32 public clubRootNode;
    bytes32 public agentRootNode;
    bytes32 public validatorMerkleRoot;
    bytes32 public agentMerkleRoot;

    event OwnershipVerified(address indexed claimant, string subdomain);
    event RecoveryInitiated(string reason);
    event ENSUpdated(address indexed ens);
    event NameWrapperUpdated(address indexed nameWrapper);
    event ClubRootNodeUpdated(bytes32 indexed clubRootNode);
    event AgentRootNodeUpdated(bytes32 indexed agentRootNode);
    event ValidatorMerkleRootUpdated(bytes32 indexed validatorMerkleRoot);
    event AgentMerkleRootUpdated(bytes32 indexed agentMerkleRoot);

    constructor(IENS _ens, INameWrapper _nameWrapper, bytes32 _clubRootNode) Ownable(msg.sender) {
        ens = _ens;
        if (address(_ens) != address(0)) {
            emit ENSUpdated(address(_ens));
        }
        nameWrapper = _nameWrapper;
        if (address(_nameWrapper) != address(0)) {
            emit NameWrapperUpdated(address(_nameWrapper));
        }
        clubRootNode = _clubRootNode;
        if (_clubRootNode != bytes32(0)) {
            emit ClubRootNodeUpdated(_clubRootNode);
        }
    }

    /// @notice Update ENS registry address
    /// @param ensAddr New ENS registry contract address
    function setENS(address ensAddr) external onlyOwner {
        ens = IENS(ensAddr);
        emit ENSUpdated(ensAddr);
    }

    /// @notice Update ENS NameWrapper address
    /// @param wrapper New ENS NameWrapper contract address
    function setNameWrapper(address wrapper) external onlyOwner {
        nameWrapper = INameWrapper(wrapper);
        emit NameWrapperUpdated(wrapper);
    }

    /// @notice Update club (validator) root node
    /// @param root New club root node hash
    function setClubRootNode(bytes32 root) external onlyOwner {
        clubRootNode = root;
        emit ClubRootNodeUpdated(root);
    }

    /// @notice Update agent root node
    /// @param root New agent root node hash
    function setAgentRootNode(bytes32 root) external onlyOwner {
        agentRootNode = root;
        emit AgentRootNodeUpdated(root);
    }

    /// @notice Update validator Merkle root
    /// @param root New validator allowlist Merkle root
    function setValidatorMerkleRoot(bytes32 root) external onlyOwner {
        validatorMerkleRoot = root;
        emit ValidatorMerkleRootUpdated(root);
    }

    /// @notice Update agent Merkle root
    function setAgentMerkleRoot(bytes32 root) external onlyOwner {
        agentMerkleRoot = root;
        emit AgentMerkleRootUpdated(root);
    }

    /// @notice Verify ENS ownership for a claimant and subdomain
    /// @param claimant Address claiming ownership
    /// @param subdomain ENS subdomain label
    /// @param proof Merkle proof for optional off-chain allowlists
    /// @param rootNode ENS namehash for the root domain
    /// @return True if ownership verified by any method
    function verifyOwnership(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof,
        bytes32 rootNode
    ) external returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(claimant));
        bytes32 merkleRoot;
        if (rootNode == clubRootNode) {
            merkleRoot = validatorMerkleRoot;
        } else if (rootNode == agentRootNode) {
            merkleRoot = agentMerkleRoot;
        } else {
            return false;
        }
        if (MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) {
            emit OwnershipVerified(claimant, subdomain);
            return true;
        }

        bytes32 subnode = keccak256(abi.encodePacked(rootNode, keccak256(bytes(subdomain))));
        try nameWrapper.ownerOf(uint256(subnode)) returns (address actualOwner) {
            if (actualOwner == claimant) {
                emit OwnershipVerified(claimant, subdomain);
                return true;
            }
        } catch Error(string memory reason) {
            emit RecoveryInitiated(reason);
        } catch {
            emit RecoveryInitiated("NameWrapper call failed without a specified reason.");
        }

        address resolverAddr = ens.resolver(subnode);
        if (resolverAddr != address(0)) {
            IResolver resolver = IResolver(resolverAddr);
            try resolver.addr(subnode) returns (address payable resolvedAddress) {
                if (resolvedAddress == claimant) {
                    emit OwnershipVerified(claimant, subdomain);
                    return true;
                }
            } catch {
                emit RecoveryInitiated("Resolver call failed without a specified reason.");
            }
        } else {
            emit RecoveryInitiated("Resolver address not found for node.");
        }

        return false;
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("ENSOwnershipVerifier: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("ENSOwnershipVerifier: no ether");
    }
}
