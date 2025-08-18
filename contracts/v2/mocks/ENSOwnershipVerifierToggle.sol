// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract ENSOwnershipVerifierToggle {
    bool public result;
    bytes32 public clubRootNode;
    bytes32 public agentRootNode;
    bytes32 public validatorMerkleRoot;
    bytes32 public agentMerkleRoot;

    function setResult(bool r) external {
        result = r;
    }

    function verifyAgent(
        address,
        string calldata,
        bytes32[] calldata
    ) external view returns (bool) {
        return result;
    }

    function verifyValidator(
        address,
        string calldata,
        bytes32[] calldata
    ) external view returns (bool) {
        return result;
    }

    function setRootNodes(bytes32 agentRoot, bytes32 clubRoot) external {
        agentRootNode = agentRoot;
        clubRootNode = clubRoot;
    }

    function setMerkleRoots(bytes32 agentRoot, bytes32 validatorRoot) external {
        agentMerkleRoot = agentRoot;
        validatorMerkleRoot = validatorRoot;
    }

    function setAgentRootNode(bytes32 root) external {
        agentRootNode = root;
    }

    function setAgentMerkleRoot(bytes32 root) external {
        agentMerkleRoot = root;
    }
}
