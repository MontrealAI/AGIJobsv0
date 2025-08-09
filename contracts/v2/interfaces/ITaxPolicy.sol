// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ITaxPolicy
/// @notice Interface for retrieving tax policy details.
interface ITaxPolicy {
    /// @notice Returns a human-readable disclaimer confirming tax responsibilities.
    /// @return disclaimer Confirms all taxes fall on employers, agents, and validators.
    function acknowledge() external view returns (string memory disclaimer);

    /// @notice Returns the URI pointing to the canonical policy document.
    /// @return uri Off-chain document location (e.g., IPFS hash).
    function policyURI() external view returns (string memory uri);

    /// @notice Convenience helper returning both acknowledgement and policy URI.
    /// @return ack Plain-text disclaimer confirming participant tax duties.
    /// @return uri Off-chain document location.
    function policyDetails()
        external
        view
        returns (string memory ack, string memory uri);
}
