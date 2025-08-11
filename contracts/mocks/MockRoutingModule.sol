// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract MockRoutingModule {
    address public operator;

    constructor(address _operator) {
        operator = _operator;
    }

    function selectOperator(bytes32) external returns (address) {
        return operator;
    }
}

