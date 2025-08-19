// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract IdentityRegistryMock {
    function isAuthorizedValidator(
        address,
        string calldata,
        bytes32[] calldata
    ) external pure returns (bool) {
        return true;
    }
}

