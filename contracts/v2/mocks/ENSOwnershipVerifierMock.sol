// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract ENSOwnershipVerifierMock {
    function verifyOwnership(
        address,
        string calldata,
        bytes32[] calldata,
        bytes32
    ) external pure returns (bool) {
        return true;
    }

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

    function setClubRootNode(bytes32) external {}

    function setValidatorMerkleRoot(bytes32) external {}

    function setAgentMerkleRoot(bytes32) external {}
}

