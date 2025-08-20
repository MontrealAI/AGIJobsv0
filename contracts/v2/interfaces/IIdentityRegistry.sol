// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IIdentityRegistry {
    function isAuthorizedAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external view returns (bool);

    function isAuthorizedValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external view returns (bool);

    function verifyAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool);

    function verifyValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool);
}

