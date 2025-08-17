// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IENS} from "../interfaces/IENS.sol";
import {INameWrapper} from "../interfaces/INameWrapper.sol";

/// @title Resolver interface used for ENS lookups
interface IResolver {
    function addr(bytes32 node) external view returns (address payable);
}

/// @title IdentityVerifier
/// @notice Verifies agent and validator identities via Merkle proofs and ENS ownership checks
contract IdentityVerifier is Ownable {
    IENS public ens;
    INameWrapper public nameWrapper;

    bytes32 public clubRootNode;
    bytes32 public agentRootNode;
    bytes32 public validatorMerkleRoot;
    bytes32 public agentMerkleRoot;

    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;

    event OwnershipVerified(address indexed claimant, string subdomain);
    event RecoveryInitiated(string reason);
    event ENSUpdated(address indexed ens);
    event NameWrapperUpdated(address indexed nameWrapper);
    event ClubRootNodeUpdated(bytes32 indexed clubRootNode);
    event AgentRootNodeUpdated(bytes32 indexed agentRootNode);
    event ValidatorMerkleRootUpdated(bytes32 indexed validatorMerkleRoot);
    event AgentMerkleRootUpdated(bytes32 indexed agentMerkleRoot);
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    event AdditionalValidatorUpdated(address indexed validator, bool allowed);

    constructor() Ownable(msg.sender) {}

    function setENS(address ensAddr) external onlyOwner {
        ens = IENS(ensAddr);
        emit ENSUpdated(ensAddr);
    }

    function setNameWrapper(address wrapper) external onlyOwner {
        nameWrapper = INameWrapper(wrapper);
        emit NameWrapperUpdated(wrapper);
    }

    function setClubRootNode(bytes32 root) external onlyOwner {
        clubRootNode = root;
        emit ClubRootNodeUpdated(root);
    }

    function setAgentRootNode(bytes32 root) external onlyOwner {
        agentRootNode = root;
        emit AgentRootNodeUpdated(root);
    }

    function setValidatorMerkleRoot(bytes32 root) external onlyOwner {
        validatorMerkleRoot = root;
        emit ValidatorMerkleRootUpdated(root);
    }

    function setAgentMerkleRoot(bytes32 root) external onlyOwner {
        agentMerkleRoot = root;
        emit AgentMerkleRootUpdated(root);
    }

    function addAdditionalAgent(address agent) external onlyOwner {
        additionalAgents[agent] = true;
        emit AdditionalAgentUpdated(agent, true);
    }

    function removeAdditionalAgent(address agent) external onlyOwner {
        additionalAgents[agent] = false;
        emit AdditionalAgentUpdated(agent, false);
    }

    function addAdditionalValidator(address val) external onlyOwner {
        additionalValidators[val] = true;
        emit AdditionalValidatorUpdated(val, true);
    }

    function removeAdditionalValidator(address val) external onlyOwner {
        additionalValidators[val] = false;
        emit AdditionalValidatorUpdated(val, false);
    }

    function verifyAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool) {
        if (additionalAgents[claimant]) {
            emit OwnershipVerified(claimant, subdomain);
            return true;
        }
        return _verifyOwnership(claimant, subdomain, proof, agentRootNode, agentMerkleRoot);
    }

    function verifyValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool) {
        if (additionalValidators[claimant]) {
            emit OwnershipVerified(claimant, subdomain);
            return true;
        }
        return _verifyOwnership(claimant, subdomain, proof, clubRootNode, validatorMerkleRoot);
    }

    function _verifyOwnership(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof,
        bytes32 rootNode,
        bytes32 merkleRoot
    ) internal returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(claimant));
        if (merkleRoot != bytes32(0) && MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) {
            emit OwnershipVerified(claimant, subdomain);
            return true;
        }

        if (rootNode == bytes32(0)) {
            return false;
        }

        bytes32 subnode = keccak256(abi.encodePacked(rootNode, keccak256(bytes(subdomain))));
        if (address(nameWrapper) != address(0)) {
            try nameWrapper.ownerOf(uint256(subnode)) returns (address ownerAddr) {
                if (ownerAddr == claimant) {
                    emit OwnershipVerified(claimant, subdomain);
                    return true;
                }
            } catch Error(string memory reason) {
                emit RecoveryInitiated(reason);
            } catch {
                emit RecoveryInitiated("NameWrapper call failed without a specified reason.");
            }
        }

        address resolverAddr = ens.resolver(subnode);
        if (resolverAddr != address(0)) {
            IResolver resolver = IResolver(resolverAddr);
            try resolver.addr(subnode) returns (address payable resolved) {
                if (resolved == claimant) {
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

    /// @notice Confirms contract and owner are tax-exempt.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    receive() external payable {
        revert("IdentityVerifier: no ether");
    }

    fallback() external payable {
        revert("IdentityVerifier: no ether");
    }
}
