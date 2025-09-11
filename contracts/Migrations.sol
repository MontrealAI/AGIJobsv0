// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title Migrations
/// @notice Truffle migration state tracking contract.
contract Migrations {
    address public owner = msg.sender;

    modifier restricted() {
        require(msg.sender == owner, "caller is not the owner");
        _;
    }

    function setCompleted(uint256) public restricted {}
}
