// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract ConfiguratorTarget {
    uint256 public value;
    bytes32 public lastModule;
    bytes32 public lastParameter;

    event ValueUpdated(uint256 indexed newValue, address indexed actor);

    function setValue(uint256 newValue, bytes32 moduleKey, bytes32 parameterKey) external {
        lastModule = moduleKey;
        lastParameter = parameterKey;
        value = newValue;
        emit ValueUpdated(newValue, msg.sender);
    }
}
