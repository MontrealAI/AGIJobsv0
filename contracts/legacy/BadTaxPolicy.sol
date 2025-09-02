// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

import "../v2/interfaces/ITaxPolicy.sol";

/// @dev Mock implementation that reports non-exempt status.
contract BadTaxPolicy is ITaxPolicy {
    uint256 private _version;
    mapping(address => uint256) public acknowledgedVersion;

    constructor() {
        _version = 1;
    }

    function acknowledge() external returns (string memory) {
        acknowledgedVersion[msg.sender] = _version;
        return "bad";
    }

    function acknowledgeFor(address user) external returns (string memory) {
        acknowledgedVersion[user] = _version;
        return "bad";
    }

    function hasAcknowledged(address user) external view returns (bool) {
        return acknowledgedVersion[user] != 0;
    }

    function acknowledgement() external pure returns (string memory) {
        return "bad";
    }

    function policyURI() external pure returns (string memory) {
        return "bad";
    }

    function policyDetails() external pure returns (string memory, string memory) {
        return ("bad", "bad");
    }

    function policyVersion() external view returns (uint256) {
        return _version;
    }

    function bumpPolicyVersion() external {
        _version += 1;
    }

    function isTaxExempt() external pure returns (bool) {
        return false;
    }
}
