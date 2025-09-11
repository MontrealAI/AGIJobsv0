// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IAddrResolver {
    function addr(bytes32 node) external view returns (address);
}
