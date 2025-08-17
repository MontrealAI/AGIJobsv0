// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract ENSOwnershipVerifierToggle {
    bool public result;

    function setResult(bool r) external {
        result = r;
    }

    function verifyOwnership(
        address,
        string calldata,
        bytes32[] calldata,
        bytes32
    ) external view returns (bool) {
        return result;
    }

    function setAgentRootNode(bytes32) external {}

    function setAgentMerkleRoot(bytes32) external {}
}
