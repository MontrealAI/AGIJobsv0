// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ITaxExempt {
    function isTaxExempt() external view returns (bool);
}

contract TaxExemptHelper {
    function check(address target) external view returns (bool) {
        return ITaxExempt(target).isTaxExempt();
    }
}
