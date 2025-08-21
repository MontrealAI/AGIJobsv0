// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IIdentityLib {
    function verifyAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool);
}

