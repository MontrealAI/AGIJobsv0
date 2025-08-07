// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationEngine
/// @notice Tracks participant reputation, penalties and blacklist status.
contract ReputationEngine is Ownable {
    /// @dev mapping of user => reputation score
    mapping(address => uint256) private _reputation;

    /// @dev number of penalties applied to a user
    mapping(address => uint256) public penaltyCount;

    /// @dev mapping of user => blacklist status
    mapping(address => bool) public blacklisted;

    /// @dev authorised callers that may update reputation
    mapping(address => bool) public callers;

    /// @notice penalty threshold after which a user is blacklisted
    uint256 public penaltyThreshold;

    event ReputationUpdated(address indexed user, int256 delta, uint256 newScore);
    event CallerAuthorized(address indexed caller, bool allowed);
    event PenaltyThresholdUpdated(uint256 newThreshold);
    event BlacklistUpdated(address indexed user, bool status);

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

    /// @notice Set the penalty threshold that triggers blacklisting.
    function setPenaltyThreshold(uint256 threshold) external onlyOwner {
        penaltyThreshold = threshold;
        emit PenaltyThresholdUpdated(threshold);
    }

    /// @notice Increase reputation for a user.
    function addReputation(address user, uint256 amount) external onlyCaller {
        uint256 newScore = _reputation[user] + amount;
        _reputation[user] = newScore;
        emit ReputationUpdated(user, int256(amount), newScore);
    }

    /// @notice Decrease reputation for a user and track penalties.
    function subtractReputation(address user, uint256 amount) external onlyCaller {
        uint256 current = _reputation[user];
        uint256 newScore = current > amount ? current - amount : 0;
        _reputation[user] = newScore;

        penaltyCount[user] += 1;
        emit ReputationUpdated(user, -int256(amount), newScore);

        if (!blacklisted[user] && penaltyThreshold > 0 && penaltyCount[user] >= penaltyThreshold) {
            blacklisted[user] = true;
            emit BlacklistUpdated(user, true);
        }
    }

    /// @notice Retrieve a user's reputation score.
    function reputationOf(address user) external view returns (uint256) {
        return _reputation[user];
    }

    /// @notice Check if a user is blacklisted.
    function isBlacklisted(address user) external view returns (bool) {
        return blacklisted[user];
    }
}

