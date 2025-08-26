// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

interface ITaxExempt {
    function isTaxExempt() external view returns (bool);
}

contract TaxExemptHelper {
    function check(address target) external view returns (bool) {
        return ITaxExempt(target).isTaxExempt();
    }
}
