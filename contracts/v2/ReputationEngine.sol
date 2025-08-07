// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";

/// @title ReputationEngineV2
/// @notice Tracks reputation for agents and validators with role-based thresholds
contract ReputationEngineV2 is IReputationEngine, Ownable {
    uint8 public constant ROLE_AGENT = 0;
    uint8 public constant ROLE_VALIDATOR = 1;

    mapping(address => uint256) private _reputation;
    mapping(address => bool) public blacklisted;
    mapping(address => bool) public callers;
    mapping(address => uint8) public roles;

    uint256 public agentThreshold;
    uint256 public validatorThreshold;

    constructor(address owner) Ownable(owner) {}

    modifier onlyCaller() {
        require(callers[msg.sender], "not authorized");
        _;
    }

    function setCaller(address caller, bool allowed) external override onlyOwner {
        callers[caller] = allowed;
    }

    function setRole(address user, uint8 role) external override onlyOwner {
        roles[user] = role;
    }

    function setThresholds(uint256 agent, uint256 validator) external override onlyOwner {
        agentThreshold = agent;
        validatorThreshold = validator;
    }

    function addReputation(address user, uint256 amount) external override onlyCaller {
        uint256 newScore = _reputation[user] + amount;
        _reputation[user] = newScore;
        emit ReputationChanged(user, int256(amount), newScore);

        uint256 threshold = _thresholdFor(user);
        if (blacklisted[user] && newScore >= threshold) {
            blacklisted[user] = false;
            emit BlacklistUpdated(user, false);
        }
    }

    function subtractReputation(address user, uint256 amount) external override onlyCaller {
        uint256 current = _reputation[user];
        uint256 newScore = current > amount ? current - amount : 0;
        _reputation[user] = newScore;
        emit ReputationChanged(user, -int256(amount), newScore);

        uint256 threshold = _thresholdFor(user);
        if (!blacklisted[user] && newScore < threshold) {
            blacklisted[user] = true;
            emit BlacklistUpdated(user, true);
        }
    }

    function reputationOf(address user) external view override returns (uint256) {
        return _reputation[user];
    }

    function isBlacklisted(address user) external view override returns (bool) {
        return blacklisted[user];
    }

    function _thresholdFor(address user) internal view returns (uint256) {
        return roles[user] == ROLE_VALIDATOR ? validatorThreshold : agentThreshold;
    }
}
