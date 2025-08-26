// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Simple identity registry mock that always authorizes.
contract IdentityRegistryMock is Ownable {
    address public ens;
    address public nameWrapper;
    address public reputationEngine;

    bytes32 public agentRootNode;
    bytes32 public clubRootNode;
    bytes32 public agentMerkleRoot;
    bytes32 public validatorMerkleRoot;

    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;
    enum AgentType {
        Human,
        AI
    }
    mapping(address => AgentType) public agentType;

    constructor() Ownable(msg.sender) {}

    event AgentRootNodeUpdated(bytes32 indexed agentRootNode);
    event ClubRootNodeUpdated(bytes32 indexed clubRootNode);
    event AgentMerkleRootUpdated(bytes32 indexed agentMerkleRoot);
    event ValidatorMerkleRootUpdated(bytes32 indexed validatorMerkleRoot);
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    event AdditionalValidatorUpdated(address indexed validator, bool allowed);
    event AgentTypeUpdated(address indexed agent, AgentType agentType);

    function setENS(address _ens) external {
        ens = _ens;
    }

    function setNameWrapper(address _wrapper) external {
        nameWrapper = _wrapper;
    }

    function setReputationEngine(address engine) external {
        reputationEngine = engine;
    }

    function setAgentRootNode(bytes32 root) external {
        agentRootNode = root;
        emit AgentRootNodeUpdated(root);
    }

    function setClubRootNode(bytes32 root) external {
        clubRootNode = root;
        emit ClubRootNodeUpdated(root);
    }

    function setAgentMerkleRoot(bytes32 root) external {
        agentMerkleRoot = root;
        emit AgentMerkleRootUpdated(root);
    }

    function setValidatorMerkleRoot(bytes32 root) external {
        validatorMerkleRoot = root;
        emit ValidatorMerkleRootUpdated(root);
    }

    function addAdditionalAgent(address agent) external {
        additionalAgents[agent] = true;
        emit AdditionalAgentUpdated(agent, true);
    }

    function removeAdditionalAgent(address agent) external {
        additionalAgents[agent] = false;
        emit AdditionalAgentUpdated(agent, false);
    }

    function addAdditionalValidator(address validator) external {
        additionalValidators[validator] = true;
        emit AdditionalValidatorUpdated(validator, true);
    }

    function removeAdditionalValidator(address validator) external {
        additionalValidators[validator] = false;
        emit AdditionalValidatorUpdated(validator, false);
    }

    function setAgentType(address agent, uint8 _type) external {
        agentType[agent] = AgentType(_type);
        emit AgentTypeUpdated(agent, AgentType(_type));
    }

    function getAgentType(address agent) external view returns (AgentType) {
        return agentType[agent];
    }

    function isAuthorizedAgent(
        address claimant,
        string calldata,
        bytes32[] calldata
    ) external view returns (bool) {
        claimant; // silence unused
        return true;
    }

    function isAuthorizedValidator(
        address claimant,
        string calldata,
        bytes32[] calldata
    ) external view returns (bool) {
        claimant; // silence unused
        return true;
    }

    function verifyAgent(
        address claimant,
        string calldata,
        bytes32[] calldata
    ) external returns (bool) {
        claimant; // silence unused
        return true;
    }

    function verifyValidator(
        address claimant,
        string calldata,
        bytes32[] calldata
    ) external returns (bool) {
        claimant; // silence unused
        return true;
    }
}

