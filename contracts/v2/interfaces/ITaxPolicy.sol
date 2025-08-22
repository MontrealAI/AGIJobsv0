// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ITaxPolicy
/// @notice Interface for retrieving tax policy details.
interface ITaxPolicy {
    /// @notice Record that `user` has acknowledged the current policy.
    /// @param user Address of the participant acknowledging.
    /// @return disclaimer Confirmation text stating the caller bears all tax liability.
    function acknowledge(address user) external returns (string memory disclaimer);

    /// @notice Check if a user has acknowledged the policy.
    /// @param user Address of the participant.
    function hasAcknowledged(address user) external view returns (bool);

    /// @notice Returns the acknowledgement text without recording acceptance.
    /// @return disclaimer Confirms all taxes fall on employers, agents, and validators.
    function acknowledgement() external view returns (string memory disclaimer);

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

    /// @notice Current version number of the policy text.
    function policyVersion() external view returns (uint256);

    /// @notice Increments the policy version without changing text or URI.
    function bumpPolicyVersion() external;

    /// @notice Indicates that the contract and its owner hold no tax liability.
    /// @return Always true; the infrastructure is perpetually tax‑exempt.
    function isTaxExempt() external pure returns (bool);
}
