// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ITaxPolicy
/// @notice Interface for retrieving tax policy details.
interface ITaxPolicy {
    /// @notice Record that the caller has acknowledged the current policy.
    /// @return disclaimer Confirmation text stating the caller bears all tax liability.
    function acknowledge() external returns (string memory disclaimer);

    /// @notice Record that `user` has acknowledged the current policy.
    /// @param user Address of the participant.
    /// @return disclaimer Confirmation text stating the participant bears all tax liability.
    function acknowledgeFor(address user) external returns (string memory disclaimer);

    /// @notice Allow or revoke an acknowledger address.
    /// @dev Only callable by the policy owner.
    /// @param acknowledger Address granted permission to acknowledge for users.
    /// @param allowed True to allow the address, false to revoke.
    function setAcknowledger(address acknowledger, bool allowed) external;

    /// @notice Batch update acknowledger permissions with per-address flags.
    /// @param acknowledgers Array of addresses to update.
    /// @param allowed Boolean flags matching `acknowledgers` by index.
    function setAcknowledgers(address[] calldata acknowledgers, bool[] calldata allowed) external;

    /// @notice Clears the acknowledgement record for a user.
    /// @param user Address whose acknowledgement should be revoked.
    function revokeAcknowledgement(address user) external;

    /// @notice Clears acknowledgement records for multiple users.
    /// @param users Addresses whose acknowledgements should be revoked.
    function revokeAcknowledgements(address[] calldata users) external;

    /// @notice Check if a user has acknowledged the policy.
    /// @param user Address of the participant.
    function hasAcknowledged(address user) external view returns (bool);

    /// @notice Check if an address is authorised to call {acknowledgeFor}.
    /// @param acknowledger Address of the delegate.
    function acknowledgerAllowed(address acknowledger) external view returns (bool);

    /// @notice Returns the policy version a user has acknowledged.
    /// @param user Address of the participant.
    /// @return version Policy version acknowledged by `user`.
    function acknowledgedVersion(address user) external view returns (uint256 version);

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
