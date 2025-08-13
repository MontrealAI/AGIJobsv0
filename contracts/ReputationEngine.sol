// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SD59x18} from "@prb/math/src/sd59x18/ValueType.sol";
import {sd} from "@prb/math/src/sd59x18/Casting.sol";

/// @title ReputationEngine
/// @notice Tracks reputation for agents and validators with blacklist support.
contract ReputationEngine is Ownable {
    enum Role { None, Agent, Validator }

    /// @dev reputation score per role
    mapping(address => uint256) private _agentReputation;
    mapping(address => uint256) private _validatorReputation;
    /// @dev last update timestamp per role
    mapping(address => uint256) private _agentLastUpdated;
    mapping(address => uint256) private _validatorLastUpdated;

    /// @dev blacklist status per role
    mapping(address => bool) public agentBlacklisted;
    mapping(address => bool) public validatorBlacklisted;

    /// @dev authorised callers mapped to the role they may update
    mapping(address => Role) public callers;

    /// @notice minimum reputation before a user is blacklisted
    uint256 public agentThreshold;
    uint256 public validatorThreshold;

    /// @notice decay constant in 1e18 fixed point. 0 disables decay.
    uint256 public decayConstant;

    event ReputationUpdated(address indexed user, Role indexed role, int256 delta, uint256 newScore);
    event BlacklistUpdated(address indexed user, Role indexed role, bool status);
    event CallerAuthorized(address indexed caller, Role role);
    event AgentThresholdUpdated(uint256 newThreshold);
    event ValidatorThresholdUpdated(uint256 newThreshold);
    event DecayConstantUpdated(uint256 newK);

    constructor() Ownable(msg.sender) {}

    /// @notice Authorize a caller and assign its role.
    function setCaller(address caller, Role role) external onlyOwner {
        callers[caller] = role;
        emit CallerAuthorized(caller, role);
    }

    /// @notice Set the reputation threshold for agents.
    function setAgentThreshold(uint256 threshold) external onlyOwner {
        agentThreshold = threshold;
        emit AgentThresholdUpdated(threshold);
    }

    /// @notice Set the reputation threshold for validators.
    function setValidatorThreshold(uint256 threshold) external onlyOwner {
        validatorThreshold = threshold;
        emit ValidatorThresholdUpdated(threshold);
    }

    /// @notice Set the decay constant `k` in 1e18 fixed point.
    function setDecayConstant(uint256 k) external onlyOwner {
        decayConstant = k;
        emit DecayConstantUpdated(k);
    }

    function _applyDecayAgent(address user) internal {
        uint256 last = _agentLastUpdated[user];
        _agentReputation[user] = _decayed(_agentReputation[user], last);
        _agentLastUpdated[user] = block.timestamp;
    }

    function _applyDecayValidator(address user) internal {
        uint256 last = _validatorLastUpdated[user];
        _validatorReputation[user] = _decayed(_validatorReputation[user], last);
        _validatorLastUpdated[user] = block.timestamp;
    }

    function _decayed(uint256 stored, uint256 last) internal view returns (uint256) {
        if (decayConstant == 0 || stored == 0 || last == 0) {
            return stored;
        }
        uint256 dt = block.timestamp - last;
        SD59x18 exponent = sd(-int256(decayConstant) * int256(dt));
        uint256 factor = uint256(exponent.exp().unwrap());
        return stored * factor / 1e18;
    }

    /// @notice Increase reputation for the caller's role.
    function addReputation(address user, uint256 amount) external {
        Role role = callers[msg.sender];
        require(role != Role.None, "not authorized");

        if (role == Role.Agent) {
            _applyDecayAgent(user);
            uint256 newScore = _agentReputation[user] + amount;
            _agentReputation[user] = newScore;
            emit ReputationUpdated(user, role, int256(amount), newScore);
        } else if (role == Role.Validator) {
            _applyDecayValidator(user);
            uint256 newScore = _validatorReputation[user] + amount;
            _validatorReputation[user] = newScore;
            emit ReputationUpdated(user, role, int256(amount), newScore);
        }
    }

    /// @notice Decrease reputation for the caller's role.
    function subtractReputation(address user, uint256 amount) external {
        Role role = callers[msg.sender];
        require(role != Role.None, "not authorized");

        if (role == Role.Agent) {
            _applyDecayAgent(user);
            uint256 current = _agentReputation[user];
            uint256 newScore = current > amount ? current - amount : 0;
            _agentReputation[user] = newScore;
            emit ReputationUpdated(user, role, -int256(amount), newScore);
            if (!agentBlacklisted[user] && newScore < agentThreshold) {
                agentBlacklisted[user] = true;
                emit BlacklistUpdated(user, role, true);
            }
        } else if (role == Role.Validator) {
            _applyDecayValidator(user);
            uint256 current = _validatorReputation[user];
            uint256 newScore = current > amount ? current - amount : 0;
            _validatorReputation[user] = newScore;
            emit ReputationUpdated(user, role, -int256(amount), newScore);
            if (!validatorBlacklisted[user] && newScore < validatorThreshold) {
                validatorBlacklisted[user] = true;
                emit BlacklistUpdated(user, role, true);
            }
        }
    }

    /// @notice Retrieve reputation score for a user and role.
    function reputationOf(address user, Role role) external view returns (uint256) {
        if (role == Role.Agent) {
            return _decayed(_agentReputation[user], _agentLastUpdated[user]);
        } else if (role == Role.Validator) {
            return _decayed(_validatorReputation[user], _validatorLastUpdated[user]);
        }
        return 0;
    }

    /// @notice Check blacklist status for a user and role.
    function isBlacklisted(address user, Role role) external view returns (bool) {
        if (role == Role.Agent) {
            return agentBlacklisted[user];
        } else if (role == Role.Validator) {
            return validatorBlacklisted[user];
        }
        return false;
    }

    /// @notice Confirms the contract and owner remain tax-exempt.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    receive() external payable {
        revert("ReputationEngine: no ether");
    }

    fallback() external payable {
        revert("ReputationEngine: no ether");
    }
}

