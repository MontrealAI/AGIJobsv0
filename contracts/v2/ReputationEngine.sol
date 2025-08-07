// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";

/// @title ReputationEngine
/// @notice Tracks participant reputation with diminishing growth and automatic blacklisting.
contract ReputationEngineV2 is IReputationEngine, Ownable {
    /// @notice Maximum reputation a user can achieve.
    uint256 public maxReputation = 88888;

    mapping(address => uint256) private _reputations;
    mapping(address => uint256) public penaltyCount;
    mapping(address => bool) public blacklisted;

    mapping(address => bool) public callers;

    uint256 public agentBlacklistThreshold;
    uint256 public validatorBlacklistThreshold;

    event BlacklistUpdated(address indexed user, bool status);
    event MaxReputationUpdated(uint256 newMax);

    constructor(address owner) Ownable(owner) {}

    modifier onlyCaller() {
        require(callers[msg.sender], "not authorized");
        _;
    }

    /// @notice Authorize or revoke a caller that can update reputation.
    function setCaller(address caller, bool allowed) external override onlyOwner {
        callers[caller] = allowed;
        emit CallerSet(caller, allowed);
    }

    /// @notice Update penalty thresholds for agents and validators.
    function setThresholds(uint256 agentThreshold, uint256 validatorThreshold)
        external
        override
        onlyOwner
    {
        agentBlacklistThreshold = agentThreshold;
        validatorBlacklistThreshold = validatorThreshold;
        emit ThresholdsUpdated(agentThreshold, validatorThreshold);
    }

    /// @notice Update the maximum reputation cap.
    function setMaxReputation(uint256 newMax) external onlyOwner {
        maxReputation = newMax;
        emit MaxReputationUpdated(newMax);
    }

    /// @inheritdoc IReputationEngine
    function addReputation(address user, uint256 amount) external override onlyCaller {
        uint256 current = _reputations[user];
        uint256 increased = current + amount;
        uint256 diminishingFactor = 1 + ((increased * increased) / (maxReputation * maxReputation));
        uint256 newScore = increased / diminishingFactor;
        if (newScore > maxReputation) {
            newScore = maxReputation;
        }
        _reputations[user] = newScore;
        emit ReputationUpdated(user, int256(amount), newScore);
    }

    /// @inheritdoc IReputationEngine
    function subtractReputation(address user, uint256 amount)
        external
        override
        onlyCaller
    {
        uint256 current = _reputations[user];
        uint256 newScore = current > amount ? current - amount : 0;
        _reputations[user] = newScore;

        penaltyCount[user] += 1;
        emit ReputationUpdated(user, -int256(amount), newScore);

        uint256 threshold = agentBlacklistThreshold;
        if (
            validatorBlacklistThreshold != 0 &&
            (threshold == 0 || validatorBlacklistThreshold < threshold)
        ) {
            threshold = validatorBlacklistThreshold;
        }
        if (!blacklisted[user] && threshold > 0 && penaltyCount[user] >= threshold) {
            blacklisted[user] = true;
            emit BlacklistUpdated(user, true);
        }
    }

    /// @inheritdoc IReputationEngine
    function reputationOf(address user) external view override returns (uint256) {
        return _reputations[user];
    }

    /// @inheritdoc IReputationEngine
    function isBlacklisted(address user) external view override returns (bool) {
        return blacklisted[user];
    }
}

