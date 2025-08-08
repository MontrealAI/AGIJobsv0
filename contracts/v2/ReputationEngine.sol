// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";

/// @title ReputationEngine
/// @notice Tracks reputation for agents and validators with role-based thresholds
///         and blacklist support. Only authorized modules may mutate state.
contract ReputationEngine is IReputationEngine, Ownable {
    uint8 public constant ROLE_AGENT = 0;
    uint8 public constant ROLE_VALIDATOR = 1;

    mapping(address => uint256) private _reputation;
    mapping(address => bool) private _blacklisted;
    mapping(address => bool) public modules;
    mapping(address => uint8) public roles;

    uint256 public agentThreshold;
    uint256 public validatorThreshold;

    constructor(address owner) Ownable(owner) {}

    modifier onlyModule() {
        require(modules[msg.sender], "not authorized");
        _;
    }

    /// @notice Authorize or revoke a module address.
    function setModule(address module, bool allowed) external override onlyOwner {
        modules[module] = allowed;
    }

    /// @notice Assign a role to a user. 0 = Agent, 1 = Validator.
    function setRole(address user, uint8 role) external override onlyOwner {
        roles[user] = role;
    }

    /// @inheritdoc IReputationEngine
    function setThresholds(uint256 agent, uint256 validator)
        external
        override
        onlyOwner
    {
        agentThreshold = agent;
        validatorThreshold = validator;
    }

    /// @notice Increase reputation for a user.
    function add(address user, uint256 amount) external override onlyModule {
        uint256 newScore = _reputation[user] + amount;
        _reputation[user] = newScore;
        emit ReputationChanged(user, int256(amount), newScore);

        uint256 threshold = _thresholdFor(user);
        if (_blacklisted[user] && newScore >= threshold) {
            _blacklisted[user] = false;
            emit BlacklistUpdated(user, false);
        }
    }

    /// @notice Decrease reputation for a user.
    function subtract(address user, uint256 amount)
        external
        override
        onlyModule
    {
        uint256 current = _reputation[user];
        uint256 newScore = current > amount ? current - amount : 0;
        _reputation[user] = newScore;
        emit ReputationChanged(user, -int256(amount), newScore);

        uint256 threshold = _thresholdFor(user);
        if (!_blacklisted[user] && newScore < threshold) {
            _blacklisted[user] = true;
            emit BlacklistUpdated(user, true);
        }
    }

    /// @notice Get reputation score for a user.
    function reputation(address user) external view override returns (uint256) {
        return _reputation[user];
    }

    /// @notice Check blacklist status for a user.
    function blacklist(address user) external view override returns (bool) {
        return _blacklisted[user];
    }

    function _thresholdFor(address user) internal view returns (uint256) {
        return roles[user] == ROLE_VALIDATOR ? validatorThreshold : agentThreshold;
    }
}

