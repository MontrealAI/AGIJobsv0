// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

contract StubReputationEngine {
    mapping(address => uint256) public reputation;
    mapping(address => bool) public _blacklist;

    function add(address user, uint256 amount) external {
        reputation[user] += amount;
    }

    function subtract(address user, uint256 amount) external {
        uint256 rep = reputation[user];
        reputation[user] = rep > amount ? rep - amount : 0;
    }

    function isBlacklisted(address user) external view returns (bool) {
        return _blacklist[user];
    }

    function blacklist(address user, bool val) external {
        _blacklist[user] = val;
    }
}
