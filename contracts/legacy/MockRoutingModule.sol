// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

contract MockRoutingModule {
    address public operator;

    constructor(address _operator) {
        operator = _operator;
    }

    function selectOperator(bytes32, bytes32) external view returns (address) {
        return operator;
    }
}

