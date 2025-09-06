// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IENS} from "./interfaces/IENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {ENSIdentityVerifier} from "./ENSIdentityVerifier.sol";
import {AttestationRegistry} from "./AttestationRegistry.sol";

error ZeroAddress();
error UnauthorizedAgent();

/// @title IdentityRegistry
/// @notice Verifies ENS subdomain ownership and tracks manual allowlists
/// for agents and validators. Provides helper views that also check
/// reputation blacklists.
contract IdentityRegistry is Ownable2Step {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;
    enum AgentType {
        Human,
        AI
    }
    IENS public ens;
    INameWrapper public nameWrapper;
    IReputationEngine public reputationEngine;
    AttestationRegistry public attestationRegistry;

    bytes32 public agentRootNode;
    bytes32 public clubRootNode;
    bytes32 public agentMerkleRoot;
    bytes32 public validatorMerkleRoot;

    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;
    mapping(address => AgentType) public agentTypes;
    /// @notice Optional metadata URI describing agent capabilities.
    mapping(address => string) public agentProfileURI;

    event ENSUpdated(address indexed ens);
    event NameWrapperUpdated(address indexed nameWrapper);
    event ReputationEngineUpdated(address indexed reputationEngine);
    event AttestationRegistryUpdated(address indexed attestationRegistry);
    event AgentRootNodeUpdated(bytes32 indexed agentRootNode);
    event ClubRootNodeUpdated(bytes32 indexed clubRootNode);
    event AgentMerkleRootUpdated(bytes32 indexed agentMerkleRoot);
    event ValidatorMerkleRootUpdated(bytes32 indexed validatorMerkleRoot);
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    event AdditionalValidatorUpdated(address indexed validator, bool allowed);
    event AdditionalAgentUsed(address indexed agent);
    event AdditionalValidatorUsed(address indexed validator);
    event AgentTypeUpdated(address indexed agent, AgentType agentType);
    /// @notice Emitted when an agent updates their profile metadata.
    event AgentProfileUpdated(address indexed agent, string uri);

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
        if (ensAddr == address(0)) {
            revert ZeroAddress();
        }
        ens = IENS(ensAddr);
        emit ENSUpdated(ensAddr);
    }

    function setNameWrapper(address wrapper) external onlyOwner {
        if (wrapper == address(0)) {
            revert ZeroAddress();
        }
        nameWrapper = INameWrapper(wrapper);
        emit NameWrapperUpdated(wrapper);
    }

    function setReputationEngine(address engine) external onlyOwner {
        if (engine == address(0)) {
            revert ZeroAddress();
        }
        reputationEngine = IReputationEngine(engine);
        emit ReputationEngineUpdated(engine);
    }

    function setAttestationRegistry(address registry) external onlyOwner {
        if (registry == address(0)) {
            revert ZeroAddress();
        }
        attestationRegistry = AttestationRegistry(registry);
        emit AttestationRegistryUpdated(registry);
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
        if (agent == address(0)) {
            revert ZeroAddress();
        }
        additionalAgents[agent] = true;
        emit AdditionalAgentUpdated(agent, true);
    }

    function removeAdditionalAgent(address agent) external onlyOwner {
        additionalAgents[agent] = false;
        emit AdditionalAgentUpdated(agent, false);
    }

    function addAdditionalValidator(address validator) external onlyOwner {
        if (validator == address(0)) {
            revert ZeroAddress();
        }
        additionalValidators[validator] = true;
        emit AdditionalValidatorUpdated(validator, true);
    }

    function removeAdditionalValidator(address validator) external onlyOwner {
        additionalValidators[validator] = false;
        emit AdditionalValidatorUpdated(validator, false);
    }

    function setAgentType(address agent, AgentType agentType) external onlyOwner {
        if (agent == address(0)) {
            revert ZeroAddress();
        }
        agentTypes[agent] = agentType;
        emit AgentTypeUpdated(agent, agentType);
    }

    function getAgentType(address agent) external view returns (AgentType) {
        return agentTypes[agent];
    }

    // ---------------------------------------------------------------------
    // Agent profile metadata
    // ---------------------------------------------------------------------

    /// @notice Set or overwrite an agent's capability metadata URI.
    /// @dev Restricted to governance/owner.
    function setAgentProfileURI(address agent, string calldata uri) external onlyOwner {
        if (agent == address(0)) {
            revert ZeroAddress();
        }
        agentProfileURI[agent] = uri;
        emit AgentProfileUpdated(agent, uri);
    }

    /// @notice Allows an agent to update their own profile after proving identity.
    /// @param subdomain ENS subdomain owned by the agent.
    /// @param proof Merkle/ENS proof demonstrating control of the subdomain.
    /// @param uri Metadata URI describing the agent's capabilities.
    function updateAgentProfile(
        string calldata subdomain,
        bytes32[] calldata proof,
        string calldata uri
    ) external {
        if (!isAuthorizedAgent(msg.sender, subdomain, proof)) {
            revert UnauthorizedAgent();
        }
        agentProfileURI[msg.sender] = uri;
        emit AgentProfileUpdated(msg.sender, uri);
    }

    // ---------------------------------------------------------------------
    // Authorization helpers
    // ---------------------------------------------------------------------

    function isAuthorizedAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public view returns (bool) {
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalAgents[claimant]) {
            return true;
        }
        if (address(attestationRegistry) != address(0)) {
            bytes32 node = keccak256(
                abi.encodePacked(agentRootNode, keccak256(bytes(subdomain)))
            );
            if (
                attestationRegistry.isAttested(
                    node,
                    AttestationRegistry.Role.Agent,
                    claimant
                )
            ) {
                return true;
            }
        }
        return
            ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                agentRootNode,
                agentMerkleRoot,
                claimant,
                subdomain,
                proof
            );
    }

    function isAuthorizedValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public view returns (bool) {
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalValidators[claimant]) {
            return true;
        }
        if (address(attestationRegistry) != address(0)) {
            bytes32 node = keccak256(
                abi.encodePacked(clubRootNode, keccak256(bytes(subdomain)))
            );
            if (
                attestationRegistry.isAttested(
                    node,
                    AttestationRegistry.Role.Validator,
                    claimant
                )
            ) {
                return true;
            }
        }
        return
            ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                clubRootNode,
                validatorMerkleRoot,
                claimant,
                subdomain,
                proof
            );
    }

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
            emit AdditionalAgentUsed(claimant);
            emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
            return true;
        }
        if (address(attestationRegistry) != address(0)) {
            bytes32 node = keccak256(
                abi.encodePacked(agentRootNode, keccak256(bytes(subdomain)))
            );
            if (
                attestationRegistry.isAttested(
                    node,
                    AttestationRegistry.Role.Agent,
                    claimant
                )
            ) {
                emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
                return true;
            }
        }
        return
            ENSIdentityVerifier.verifyOwnership(
                ens,
                nameWrapper,
                agentRootNode,
                agentMerkleRoot,
                claimant,
                subdomain,
                proof
            );
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
            emit AdditionalValidatorUsed(claimant);
            emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
            return true;
        }
        if (address(attestationRegistry) != address(0)) {
            bytes32 node = keccak256(
                abi.encodePacked(clubRootNode, keccak256(bytes(subdomain)))
            );
            if (
                attestationRegistry.isAttested(
                    node,
                    AttestationRegistry.Role.Validator,
                    claimant
                )
            ) {
                emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
                return true;
            }
        }
        return
            ENSIdentityVerifier.verifyOwnership(
                ens,
                nameWrapper,
                clubRootNode,
                validatorMerkleRoot,
                claimant,
                subdomain,
                proof
            );
    }
}

