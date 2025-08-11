// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

contract StubReputationEngine {
    mapping(address => uint256) public reputation;

    function addReputation(address user, uint256 amount) external {
        reputation[user] += amount;
    }

    function subtractReputation(address user, uint256 amount) external {
        uint256 rep = reputation[user];
        reputation[user] = rep > amount ? rep - amount : 0;
    }
}
