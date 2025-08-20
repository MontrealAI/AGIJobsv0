// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IIdentityRegistry {
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

    function additionalAgents(address account) external view returns (bool);

    function additionalValidators(address account) external view returns (bool);
}

