// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IIdentityLib {
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

    function updateRootNodes(bytes32 agentRoot, bytes32 clubRoot) external;
    function updateMerkleRoots(bytes32 agentRoot, bytes32 validatorRoot) external;
    function addAdditionalAgent(address agent) external;
    function removeAdditionalAgent(address agent) external;
    function addAdditionalValidator(address validator) external;
    function removeAdditionalValidator(address validator) external;
}

