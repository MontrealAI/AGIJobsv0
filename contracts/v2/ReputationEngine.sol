// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";

/// @title ReputationEngine
/// @notice Tracks reputation scores with blacklist enforcement.
/// Only authorised callers may update scores.
contract ReputationEngine is Ownable, IReputationEngine {
    mapping(address => uint256) private _scores;
    mapping(address => bool) private _blacklisted;
    mapping(address => bool) public callers;
    uint256 public threshold;

    constructor(address owner) Ownable(owner) {}

    modifier onlyCaller() {
        require(callers[msg.sender], "not authorized");
        _;
    }

    /// @notice Authorize or revoke a caller.
    function setCaller(address caller, bool allowed) external override onlyOwner {
        callers[caller] = allowed;
        emit CallerUpdated(caller, allowed);
    }

    /// @notice Set reputation threshold for automatic blacklisting.
    function setThreshold(uint256 newThreshold) external override onlyOwner {
        threshold = newThreshold;
        emit ThresholdUpdated(newThreshold);
    }

    /// @notice Manually set blacklist status for a user.
    function setBlacklist(address user, bool status) external override onlyOwner {
        _blacklisted[user] = status;
        emit Blacklisted(user, status);
    }

    /// @notice Increase reputation for a user.
    function add(address user, uint256 amount) external override onlyCaller {
        uint256 newScore = _scores[user] + amount;
        _scores[user] = newScore;
        emit ReputationChanged(user, int256(amount), newScore);

        if (_blacklisted[user] && newScore >= threshold) {
            _blacklisted[user] = false;
            emit Blacklisted(user, false);
        }
    }

    /// @notice Decrease reputation for a user.
    function subtract(address user, uint256 amount) external override onlyCaller {
        uint256 current = _scores[user];
        uint256 newScore = current > amount ? current - amount : 0;
        _scores[user] = newScore;
        emit ReputationChanged(user, -int256(amount), newScore);

        if (!_blacklisted[user] && newScore < threshold) {
            _blacklisted[user] = true;
            emit Blacklisted(user, true);
        }
    }

    /// @notice Get reputation score for a user.
    function reputation(address user) external view override returns (uint256) {
        return _scores[user];
    }

    /// @notice Check blacklist status for a user.
    function isBlacklisted(address user) external view override returns (bool) {
        return _blacklisted[user];
    }
}

