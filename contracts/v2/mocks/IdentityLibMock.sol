// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Simple identity library mock that always authorizes.
contract IdentityLibMock {
    bytes32 public clubRootNode;
    bytes32 public agentRootNode;
    bytes32 public validatorMerkleRoot;
    bytes32 public agentMerkleRoot;
    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;

    function verifyAgent(
        address,
        string calldata,
        bytes32[] calldata
    ) external pure returns (bool) {
        return true;
    }

    function verifyValidator(
        address,
        string calldata,
        bytes32[] calldata
    ) external pure returns (bool) {
        return true;
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
