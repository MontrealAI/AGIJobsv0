// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface IJobRegistryAck {
    function acknowledgeTaxPolicy() external returns (string memory);
    function acknowledgeFor(address user) external returns (string memory);
}

