// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract CoverageGovernanceTarget {
    uint256 public value;
    address public lastExecutor;

    event ValueSet(uint256 indexed newValue);

    function setValue(uint256 newValue) external {
        value = newValue;
        lastExecutor = msg.sender;
        emit ValueSet(newValue);
    }
}
