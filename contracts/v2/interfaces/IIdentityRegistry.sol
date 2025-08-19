// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IIdentityRegistry {
    function isAuthorizedValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external view returns (bool);
}

