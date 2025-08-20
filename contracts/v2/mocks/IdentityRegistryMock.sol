// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract IdentityRegistryMock {
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
}

