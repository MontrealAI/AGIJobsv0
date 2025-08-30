// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IENS} from "../interfaces/IENS.sol";
import {INameWrapper} from "../interfaces/INameWrapper.sol";
import {IReputationEngine} from "../interfaces/IReputationEngine.sol";

/// @dev Minimal resolver interface for address resolution.
interface IResolver {
    function addr(bytes32 node) external view returns (address payable);
}

/// @title IdentityLib
/// @notice Module providing ENS ownership verification for agents and validators.
contract IdentityLib is Ownable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    IENS public ens;
    INameWrapper public nameWrapper;
    IReputationEngine public reputationEngine;

    /// @notice Contracts allowed to update configuration alongside the owner
    address public jobRegistry;
    address public validationModule;

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
    event RootNodeUpdated(string node, bytes32 newRoot);
    event MerkleRootUpdated(string root, bytes32 newRoot);
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    event AdditionalValidatorUpdated(address indexed validator, bool allowed);
    event ModulesUpdated(address jobRegistry, address validationModule);

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
            emit RootNodeUpdated("agent", _agentRootNode);
        }
        clubRootNode = _clubRootNode;
        if (_clubRootNode != bytes32(0)) {
            emit RootNodeUpdated("club", _clubRootNode);
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

    /// @notice Set the JobRegistry and ValidationModule allowed to manage settings
    function setModules(address _jobRegistry, address _validationModule) external onlyOwner {
        jobRegistry = _jobRegistry;
        validationModule = _validationModule;
        emit ModulesUpdated(_jobRegistry, _validationModule);
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == owner() ||
                msg.sender == jobRegistry ||
                msg.sender == validationModule,
            "not authorized"
        );
        _;
    }

    function updateRootNodes(bytes32 agentRoot, bytes32 clubRoot) external onlyAuthorized {
        agentRootNode = agentRoot;
        clubRootNode = clubRoot;
        emit RootNodeUpdated("agent", agentRoot);
        emit RootNodeUpdated("club", clubRoot);
    }

    function updateMerkleRoots(bytes32 agentRoot, bytes32 validatorRoot) external onlyAuthorized {
        agentMerkleRoot = agentRoot;
        validatorMerkleRoot = validatorRoot;
        emit MerkleRootUpdated("agent", agentRoot);
        emit MerkleRootUpdated("validator", validatorRoot);
    }

    function addAdditionalAgent(address agent) external onlyAuthorized {
        require(agent != address(0), "agent");
        additionalAgents[agent] = true;
        emit AdditionalAgentUpdated(agent, true);
    }

    function removeAdditionalAgent(address agent) external onlyAuthorized {
        additionalAgents[agent] = false;
        emit AdditionalAgentUpdated(agent, false);
    }

    function addAdditionalValidator(address validator) external onlyAuthorized {
        require(validator != address(0), "validator");
        additionalValidators[validator] = true;
        emit AdditionalValidatorUpdated(validator, true);
    }

    function removeAdditionalValidator(address validator) external onlyAuthorized {
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
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
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
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalValidators[claimant]) {
            emit OwnershipVerified(claimant, subdomain);
            return true;
        }
        return _verifyOwnership(claimant, subdomain, proof, clubRootNode);
    }

    // ---------------------------------------------------------------------
    // Internal logic
    // ---------------------------------------------------------------------

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

