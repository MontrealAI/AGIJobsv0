// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract ENSOwnershipVerifierMock {
    bytes32 public clubRootNode;
    bytes32 public agentRootNode;
    bytes32 public validatorMerkleRoot;
    bytes32 public agentMerkleRoot;

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

    function setRootNodes(bytes32 agentRoot, bytes32 clubRoot) external {
        agentRootNode = agentRoot;
        clubRootNode = clubRoot;
    }

    function setMerkleRoots(bytes32 agentRoot, bytes32 validatorRoot) external {
        agentMerkleRoot = agentRoot;
        validatorMerkleRoot = validatorRoot;
    }

    function setClubRootNode(bytes32 root) external {
        clubRootNode = root;
    }

    function setAgentRootNode(bytes32 root) external {
        agentRootNode = root;
    }

    function setValidatorMerkleRoot(bytes32 root) external {
        validatorMerkleRoot = root;
    }

    function setAgentMerkleRoot(bytes32 root) external {
        agentMerkleRoot = root;
    }
}
