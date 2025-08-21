// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Identity library mock with toggled verification result.
contract IdentityLibToggle {
    bool public result;
    bytes32 public clubRootNode;
    bytes32 public agentRootNode;
    bytes32 public validatorMerkleRoot;
    bytes32 public agentMerkleRoot;

    function setResult(bool r) external {
        result = r;
    }

    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;

    function verifyAgent(
        address claimant,
        string calldata,
        bytes32[] calldata
    ) external view returns (bool) {
        if (additionalAgents[claimant]) {
            return true;
        }
        return result;
    }

    function verifyValidator(
        address claimant,
        string calldata,
        bytes32[] calldata
    ) external view returns (bool) {
        if (additionalValidators[claimant]) {
            return true;
        }
        return result;
    }

    function updateRootNodes(bytes32 agentRoot, bytes32 clubRoot) external {
        agentRootNode = agentRoot;
        clubRootNode = clubRoot;
    }

    function updateMerkleRoots(bytes32 agentRoot, bytes32 validatorRoot) external {
        agentMerkleRoot = agentRoot;
        validatorMerkleRoot = validatorRoot;
    }

    function addAdditionalAgent(address agent) external {
        additionalAgents[agent] = true;
    }

    function removeAdditionalAgent(address agent) external {
        additionalAgents[agent] = false;
    }

    function addAdditionalValidator(address validator) external {
        additionalValidators[validator] = true;
    }

    function removeAdditionalValidator(address validator) external {
        additionalValidators[validator] = false;
    }
}
