// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationEngine
/// @notice Tracks reputation for agents and validators with blacklist support.
contract ReputationEngine is Ownable {
    enum Role { None, Agent, Validator }

    /// @dev reputation score per role
    mapping(address => uint256) private _agentReputation;
    mapping(address => uint256) private _validatorReputation;

    /// @dev blacklist status per role
    mapping(address => bool) public agentBlacklisted;
    mapping(address => bool) public validatorBlacklisted;

    /// @dev authorised callers mapped to the role they may update
    mapping(address => Role) public callers;

    /// @notice minimum reputation before a user is blacklisted
    uint256 public agentThreshold;
    uint256 public validatorThreshold;

    event ReputationUpdated(address indexed user, Role indexed role, int256 delta, uint256 newScore);
    event BlacklistUpdated(address indexed user, Role indexed role, bool status);
    event CallerAuthorized(address indexed caller, Role role);
    event AgentThresholdUpdated(uint256 newThreshold);
    event ValidatorThresholdUpdated(uint256 newThreshold);

    constructor(address owner) Ownable(owner) {}

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

    /// @notice Increase reputation for the caller's role.
    function addReputation(address user, uint256 amount) external {
        Role role = callers[msg.sender];
        require(role != Role.None, "not authorized");

        if (role == Role.Agent) {
            uint256 newScore = _agentReputation[user] + amount;
            _agentReputation[user] = newScore;
            emit ReputationUpdated(user, role, int256(amount), newScore);
        } else if (role == Role.Validator) {
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
            uint256 current = _agentReputation[user];
            uint256 newScore = current > amount ? current - amount : 0;
            _agentReputation[user] = newScore;
            emit ReputationUpdated(user, role, -int256(amount), newScore);
            if (!agentBlacklisted[user] && newScore < agentThreshold) {
                agentBlacklisted[user] = true;
                emit BlacklistUpdated(user, role, true);
            }
        } else if (role == Role.Validator) {
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
            return _agentReputation[user];
        } else if (role == Role.Validator) {
            return _validatorReputation[user];
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

