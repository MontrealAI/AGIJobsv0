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
}

