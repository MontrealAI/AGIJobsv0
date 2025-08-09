// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../v2/interfaces/ITaxPolicy.sol";

/// @dev Mock implementation that reports non-exempt status.
contract BadTaxPolicy is ITaxPolicy {
    function acknowledge() external pure returns (string memory) {
        return "bad";
    }

    function policyURI() external pure returns (string memory) {
        return "bad";
    }

    function policyDetails() external pure returns (string memory, string memory) {
        return ("bad", "bad");
    }

    function isTaxExempt() external pure returns (bool) {
        return false;
    }
}
