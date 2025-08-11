// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

contract StubStakeManager {
    mapping(address => uint256) public stakes;

    function setStake(address user, uint256 amount) external {
        stakes[user] = amount;
    }

    function lockReward(address, uint256) external {}

    function payReward(address, uint256) external {}

    function slash(address, address, uint256) external {}

    function releaseStake(address, uint256) external {}
}
