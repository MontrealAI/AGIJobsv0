// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ITaxPolicy} from "../interfaces/ITaxPolicy.sol";

/// @title TaxPolicyNonExempt
/// @notice Mock tax policy that reports non-exempt status for testing.
contract TaxPolicyNonExempt is ITaxPolicy {
    function acknowledge() external pure override returns (string memory) {
        return "";
    }

    function acknowledgeFor(address) external pure override returns (string memory) {
        return "";
    }

    function setAcknowledger(address, bool) external pure override {}

    function setAcknowledgers(address[] calldata, bool[] calldata) external pure override {}

    function revokeAcknowledgement(address) external pure override {}

    function revokeAcknowledgements(address[] calldata) external pure override {}

    function hasAcknowledged(address) external pure override returns (bool) {
        return false;
    }

    function acknowledgerAllowed(address) external pure override returns (bool) {
        return false;
    }

    function acknowledgedVersion(address) external pure override returns (uint256) {
        return 0;
    }

    function acknowledgement() external pure override returns (string memory) {
        return "";
    }

    function policyURI() external pure override returns (string memory) {
        return "";
    }

    function policyDetails()
        external
        pure
        override
        returns (string memory ack, string memory uri)
    {
        ack = "";
        uri = "";
    }

    function policyVersion() external pure override returns (uint256) {
        return 0;
    }

    function bumpPolicyVersion() external pure override {}

    function isTaxExempt() external pure override returns (bool) {
        return false;
    }
}
