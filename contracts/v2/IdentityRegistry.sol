// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IENS} from "./interfaces/IENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";

/// @title Resolver interface
/// @notice Minimal interface to query addresses from ENS records.
interface IResolver {
    /// @notice Get the address associated with an ENS node.
    /// @param node The ENS node hash.
    /// @return resolvedAddress The resolved payable address for `node`.
    function addr(bytes32 node) external view returns (address payable resolvedAddress);
}

/// @title IdentityRegistry
/// @notice Verifies ENS subdomain ownership and tracks manual allowlists
/// for agents and validators. Provides helper views that also check
/// reputation blacklists.
contract IdentityRegistry is Ownable {
    IENS public ens;
    INameWrapper public nameWrapper;
    IReputationEngine public reputationEngine;

    bytes32 public agentRootNode;
    bytes32 public clubRootNode;
    bytes32 public agentMerkleRoot;
    bytes32 public validatorMerkleRoot;

    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;

    event OwnershipVerified(address indexed claimant, string subdomain);
    event RecoveryInitiated(string reason);
    event ENSUpdated(address indexed ens);
    event NameWrapperUpdated(address indexed nameWrapper);
    event ReputationEngineUpdated(address indexed reputationEngine);
    event AgentRootNodeUpdated(bytes32 indexed agentRootNode);
    event ClubRootNodeUpdated(bytes32 indexed clubRootNode);
    event AgentMerkleRootUpdated(bytes32 indexed agentMerkleRoot);
    event ValidatorMerkleRootUpdated(bytes32 indexed validatorMerkleRoot);
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    event AdditionalValidatorUpdated(address indexed validator, bool allowed);

    constructor(
        IENS _ens,
        INameWrapper _nameWrapper,
        IReputationEngine _reputationEngine,
        bytes32 _agentRootNode,
        bytes32 _clubRootNode
    ) Ownable(msg.sender) {
        ens = _ens;
        if (address(_ens) != address(0)) {
            emit ENSUpdated(address(_ens));
        }
        nameWrapper = _nameWrapper;
        if (address(_nameWrapper) != address(0)) {
            emit NameWrapperUpdated(address(_nameWrapper));
        }
        reputationEngine = _reputationEngine;
        if (address(_reputationEngine) != address(0)) {
            emit ReputationEngineUpdated(address(_reputationEngine));
        }
        agentRootNode = _agentRootNode;
        if (_agentRootNode != bytes32(0)) {
            emit AgentRootNodeUpdated(_agentRootNode);
        }
        clubRootNode = _clubRootNode;
        if (_clubRootNode != bytes32(0)) {
            emit ClubRootNodeUpdated(_clubRootNode);
        }
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------

    function setENS(address ensAddr) external onlyOwner {
        ens = IENS(ensAddr);
        emit ENSUpdated(ensAddr);
    }

    function setNameWrapper(address wrapper) external onlyOwner {
        nameWrapper = INameWrapper(wrapper);
        emit NameWrapperUpdated(wrapper);
    }

    function setReputationEngine(address engine) external onlyOwner {
        reputationEngine = IReputationEngine(engine);
        emit ReputationEngineUpdated(engine);
    }

    function setAgentRootNode(bytes32 root) external onlyOwner {
        agentRootNode = root;
        emit AgentRootNodeUpdated(root);
    }

    function setClubRootNode(bytes32 root) external onlyOwner {
        clubRootNode = root;
        emit ClubRootNodeUpdated(root);
    }

    function setAgentMerkleRoot(bytes32 root) external onlyOwner {
        agentMerkleRoot = root;
        emit AgentMerkleRootUpdated(root);
    }

    function setValidatorMerkleRoot(bytes32 root) external onlyOwner {
        validatorMerkleRoot = root;
        emit ValidatorMerkleRootUpdated(root);
    }

    function addAdditionalAgent(address agent) external onlyOwner {
        require(agent != address(0), "agent");
        additionalAgents[agent] = true;
        emit AdditionalAgentUpdated(agent, true);
    }

    function removeAdditionalAgent(address agent) external onlyOwner {
        additionalAgents[agent] = false;
        emit AdditionalAgentUpdated(agent, false);
    }

    function addAdditionalValidator(address validator) external onlyOwner {
        require(validator != address(0), "validator");
        additionalValidators[validator] = true;
        emit AdditionalValidatorUpdated(validator, true);
    }

    function removeAdditionalValidator(address validator) external onlyOwner {
        additionalValidators[validator] = false;
        emit AdditionalValidatorUpdated(validator, false);
    }

    // ---------------------------------------------------------------------
    // Authorization helpers
    // ---------------------------------------------------------------------

    function isAuthorizedAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external view returns (bool) {
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalAgents[claimant]) {
            return true;
        }
        return _checkOwnership(claimant, subdomain, proof, agentRootNode);
    }

    function isAuthorizedValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external view returns (bool) {
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalValidators[claimant]) {
            return true;
        }
        return _checkOwnership(claimant, subdomain, proof, clubRootNode);
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
        return _verifyOwnership(claimant, subdomain, proof, agentRootNode);
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
        return _verifyOwnership(claimant, subdomain, proof, clubRootNode);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _checkOwnership(
        address claimant,
        string memory subdomain,
        bytes32[] calldata proof,
        bytes32 rootNode
    ) internal view returns (bool) {
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

    function _verifyOwnership(
        address claimant,
        string memory subdomain,
        bytes32[] calldata proof,
        bytes32 rootNode
    ) internal returns (bool) {
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
        bytes32 subnode = keccak256(
            abi.encodePacked(rootNode, keccak256(bytes(subdomain)))
        );
        try nameWrapper.ownerOf(uint256(subnode)) returns (address actualOwner) {
            if (actualOwner == claimant) {
                emit OwnershipVerified(claimant, subdomain);
                return true;
            }
        } catch Error(string memory reason) {
            emit RecoveryInitiated(reason);
        } catch {
            emit RecoveryInitiated(
                "NameWrapper call failed without a specified reason."
            );
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
            } catch {
                emit RecoveryInitiated(
                    "Resolver call failed without a specified reason."
                );
            }
        } else {
            emit RecoveryInitiated("Resolver address not found for node.");
        }
        return false;
    }
}

