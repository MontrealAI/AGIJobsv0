// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

contract StubStakeManager {
    mapping(address => uint256) public stakes;

    /// @notice tracks locked amounts for testing bond logic
    mapping(address => uint256) public locked;

    /// @notice records slashed amounts from users to recipients
    mapping(address => mapping(address => uint256)) public slashed;

    function setStake(address user, uint256 amount) external {
        stakes[user] = amount;
    }

    function lockReward(address from, uint256 amount) external {
        locked[from] += amount;
    }

    function payReward(address, uint256) external {}

    function slash(address user, address recipient, uint256 amount) external {
        slashed[user][recipient] += amount;
    }

    function releaseStake(address, uint256) external {}
}
