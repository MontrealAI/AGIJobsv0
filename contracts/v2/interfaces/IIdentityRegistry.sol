// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IIdentityRegistry
/// @notice Interface for checking agent authorization
interface IIdentityRegistry {
    /// @notice Verify that an agent is authorised to participate
    /// @param claimant Address claiming authorisation
    /// @param subdomain ENS subdomain label used for verification
    /// @param proof Merkle proof validating the subdomain
    /// @return True if the agent is authorised
    function isAuthorizedAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external view returns (bool);
}

