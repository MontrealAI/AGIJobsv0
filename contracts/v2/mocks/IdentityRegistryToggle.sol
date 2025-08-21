// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Identity registry mock with toggled verification result.
contract IdentityRegistryToggle is Ownable {
    bool public result;
    bytes32 public clubRootNode;
    bytes32 public agentRootNode;
    bytes32 public validatorMerkleRoot;
    bytes32 public agentMerkleRoot;

    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;

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
    ) external returns (bool) {
        if (additionalAgents[claimant]) {
            return true;
        }
        return result;
    }

    function verifyValidator(
        address claimant,
        string calldata,
        bytes32[] calldata
    ) external returns (bool) {
        if (additionalValidators[claimant]) {
            return true;
        }
        return result;
    }
}

