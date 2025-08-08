// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationEngine
/// @notice Tracks reputation scores with blacklist enforcement.
/// Only authorised callers may update scores.
contract ReputationEngine is Ownable {
    mapping(address => uint256) private _scores;
    mapping(address => bool) private _blacklisted;
    mapping(address => bool) public callers;
    uint256 public threshold;

    /// @notice Error thrown when caller lacks authorisation
    error UnauthorizedCaller();

    event ReputationChanged(address indexed user, int256 delta, uint256 newScore);
    event Blacklisted(address indexed user, bool status);

    constructor(address owner) Ownable(owner) {}

    modifier onlyCaller() {
        if (!callers[msg.sender]) revert UnauthorizedCaller();
        _;
    }

    /// @notice Authorize or revoke a caller
    /// @param caller Address of the caller
    /// @param allowed True to authorise the caller
    function setCaller(address caller, bool allowed) external onlyOwner {
        callers[caller] = allowed;
    }

    /// @notice Set reputation threshold for automatic blacklisting
    /// @param newThreshold Minimum reputation before removal from blacklist
    function setThreshold(uint256 newThreshold) external onlyOwner {
        threshold = newThreshold;
    }

    /// @notice Manually set blacklist status for a user
    /// @param user Address of the user
    /// @param status New blacklist status
    function setBlacklist(address user, bool status) external onlyOwner {
        _blacklisted[user] = status;
        emit Blacklisted(user, status);
    }

    /// @notice Increase reputation for a user
    /// @param user Address whose reputation increases
    /// @param amount Amount to add
    function add(address user, uint256 amount) external onlyCaller {
        uint256 newScore = _scores[user] + amount;
        _scores[user] = newScore;
        emit ReputationChanged(user, int256(amount), newScore);

        if (_blacklisted[user] && newScore >= threshold) {
            _blacklisted[user] = false;
            emit Blacklisted(user, false);
        }
    }

    /// @notice Decrease reputation for a user
    /// @param user Address whose reputation decreases
    /// @param amount Amount to subtract
    function subtract(address user, uint256 amount) external onlyCaller {
        uint256 current = _scores[user];
        uint256 newScore = current > amount ? current - amount : 0;
        _scores[user] = newScore;
        emit ReputationChanged(user, -int256(amount), newScore);

        if (!_blacklisted[user] && newScore < threshold) {
            _blacklisted[user] = true;
            emit Blacklisted(user, true);
        }
    }

    /// @notice Get reputation score for a user
    /// @param user Address to query
    /// @return Reputation score
    function reputation(address user) external view returns (uint256) {
        return _scores[user];
    }

    /// @notice Check blacklist status for a user
    /// @param user Address to query
    /// @return True if blacklisted
    function isBlacklisted(address user) external view returns (bool) {
        return _blacklisted[user];
    }
}

