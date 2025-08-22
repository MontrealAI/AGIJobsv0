// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IENS} from "./interfaces/IENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";

interface IResolver {
    function addr(bytes32 node) external view returns (address payable);
}

/// @title IdentityModule
/// @notice Provides ENS ownership verification for agents and validators.
contract IdentityModule is Ownable {
    IENS public ens;
    INameWrapper public nameWrapper;

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
    event RootNodeUpdated(string node, bytes32 newRoot);
    event MerkleRootUpdated(string root, bytes32 newRoot);
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    event AdditionalValidatorUpdated(address indexed validator, bool allowed);

    constructor(
        IENS _ens,
        INameWrapper _nameWrapper,
        bytes32 _agentRootNode,
        bytes32 _clubRootNode,
        bytes32 _agentMerkleRoot,
        bytes32 _validatorMerkleRoot
    ) Ownable(msg.sender) {
        ens = _ens;
        nameWrapper = _nameWrapper;
        agentRootNode = _agentRootNode;
        clubRootNode = _clubRootNode;
        agentMerkleRoot = _agentMerkleRoot;
        validatorMerkleRoot = _validatorMerkleRoot;
        if (address(_ens) != address(0)) {
            emit ENSUpdated(address(_ens));
        }
        if (address(_nameWrapper) != address(0)) {
            emit NameWrapperUpdated(address(_nameWrapper));
        }
        if (_agentRootNode != bytes32(0)) {
            emit RootNodeUpdated("agent", _agentRootNode);
        }
        if (_clubRootNode != bytes32(0)) {
            emit RootNodeUpdated("club", _clubRootNode);
        }
        if (_agentMerkleRoot != bytes32(0)) {
            emit MerkleRootUpdated("agent", _agentMerkleRoot);
        }
        if (_validatorMerkleRoot != bytes32(0)) {
            emit MerkleRootUpdated("validator", _validatorMerkleRoot);
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

    function setRootNodes(bytes32 agentRoot, bytes32 clubRoot) external onlyOwner {
        agentRootNode = agentRoot;
        clubRootNode = clubRoot;
        emit RootNodeUpdated("agent", agentRoot);
        emit RootNodeUpdated("club", clubRoot);
    }

    function setMerkleRoots(bytes32 agentRoot, bytes32 validatorRoot) external onlyOwner {
        agentMerkleRoot = agentRoot;
        validatorMerkleRoot = validatorRoot;
        emit MerkleRootUpdated("agent", agentRoot);
        emit MerkleRootUpdated("validator", validatorRoot);
    }

    function addAdditionalAgent(address agent) external onlyOwner {
        additionalAgents[agent] = true;
        emit AdditionalAgentUpdated(agent, true);
    }

    function removeAdditionalAgent(address agent) external onlyOwner {
        additionalAgents[agent] = false;
        emit AdditionalAgentUpdated(agent, false);
    }

    function addAdditionalValidator(address validator) external onlyOwner {
        additionalValidators[validator] = true;
        emit AdditionalValidatorUpdated(validator, true);
    }

    function removeAdditionalValidator(address validator) external onlyOwner {
        additionalValidators[validator] = false;
        emit AdditionalValidatorUpdated(validator, false);
    }

    // ---------------------------------------------------------------------
    // Verification
    // ---------------------------------------------------------------------

    function verifyAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool) {
        if (additionalAgents[claimant]) {
            emit OwnershipVerified(claimant, subdomain);
            return true;
        }
        return
            _verifyOwnership(
                claimant,
                subdomain,
                proof,
                agentRootNode,
                agentMerkleRoot
            );
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
        return
            _verifyOwnership(
                claimant,
                subdomain,
                proof,
                clubRootNode,
                validatorMerkleRoot
            );
    }

    // ---------------------------------------------------------------------
    // Internal logic
    // ---------------------------------------------------------------------

    function _verifyOwnership(
        address claimant,
        string memory subdomain,
        bytes32[] calldata proof,
        bytes32 rootNode,
        bytes32 merkleRoot
    ) internal returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(claimant));
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

