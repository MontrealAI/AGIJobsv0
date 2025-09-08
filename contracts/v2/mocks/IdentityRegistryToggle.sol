// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Identity registry mock with toggled verification result.
contract IdentityRegistryToggle is Ownable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    bool public result;
    bytes32 public clubRootNode;
    bytes32 public agentRootNode;
    bytes32 public validatorMerkleRoot;
    bytes32 public agentMerkleRoot;

    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;
    enum AgentType {
        Human,
        AI
    }
    mapping(address => AgentType) public agentTypes;

    constructor() Ownable(msg.sender) {}

    function setResult(bool r) external onlyOwner {
        result = r;
    }

    function setENS(address) external onlyOwner {}
    function setNameWrapper(address) external onlyOwner {}
    function setReputationEngine(address) external onlyOwner {}

    event AgentRootNodeUpdated(bytes32 indexed agentRootNode);
    event ClubRootNodeUpdated(bytes32 indexed clubRootNode);
    event AgentMerkleRootUpdated(bytes32 indexed agentMerkleRoot);
    event ValidatorMerkleRootUpdated(bytes32 indexed validatorMerkleRoot);
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    event AdditionalValidatorUpdated(address indexed validator, bool allowed);
    event AgentTypeUpdated(address indexed agent, AgentType agentType);

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

    function setAgentType(address agent, AgentType agentType) external onlyOwner {
        agentTypes[agent] = agentType;
        emit AgentTypeUpdated(agent, agentType);
    }

    function getAgentType(address agent) external view returns (AgentType) {
        return agentTypes[agent];
    }

    function isAuthorizedAgent(
        address claimant,
        string calldata,
        bytes32[] calldata
    ) external view returns (bool) {
        if (additionalAgents[claimant]) {
            return true;
        }
        return result;
    }

    function isAuthorizedValidator(
        address claimant,
        string calldata,
        bytes32[] calldata
    ) external view returns (bool) {
        if (additionalValidators[claimant]) {
            return true;
        }
        return result;
    }

    function verifyAgent(
        address claimant,
        string calldata,
        bytes32[] calldata
    )
        external
        returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle)
    {
        node = bytes32(0);
        if (additionalAgents[claimant]) {
            ok = true;
        } else {
            ok = result;
        }
    }

    function verifyValidator(
        address claimant,
        string calldata,
        bytes32[] calldata
    )
        external
        returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle)
    {
        node = bytes32(0);
        if (additionalValidators[claimant]) {
            ok = true;
        } else {
            ok = result;
        }
    }
}

