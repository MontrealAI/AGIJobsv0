// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationEngine
/// @notice Tracks reputation scores for participants.
contract ReputationEngine is Ownable {
    mapping(address => int256) public reputation;
    mapping(address => bool) public callers;

    event ReputationUpdated(address indexed user, int256 newScore);
    event CallerAuthorized(address indexed caller, bool allowed);

    constructor(address owner) Ownable(owner) {}

    modifier onlyCaller() {
        require(callers[msg.sender], "not authorized");
        _;
    }

    /// @notice Authorize or revoke a caller that can update reputation.
    function setCaller(address caller, bool allowed) external onlyOwner {
        callers[caller] = allowed;
        emit CallerAuthorized(caller, allowed);
    }

    /// @notice Increase reputation for a user.
    function increaseReputation(address user, uint256 amount) external onlyCaller {
        reputation[user] += int256(amount);
        emit ReputationUpdated(user, reputation[user]);
    }

    /// @notice Decrease reputation for a user.
    function decreaseReputation(address user, uint256 amount) external onlyCaller {
        reputation[user] -= int256(amount);
        emit ReputationUpdated(user, reputation[user]);
    }
}

