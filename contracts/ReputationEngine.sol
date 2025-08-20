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

    /// @notice JobRegistry allowed to invoke lifecycle hooks
    address public jobRegistry;

    /// @notice minimum reputation before a user is blacklisted
    uint256 public agentThreshold;
    uint256 public validatorThreshold;

    /// @notice maximum attainable reputation
    uint256 public constant maxReputation = 88_888;

    /// @notice percentage of agent reputation awarded to validators
    uint256 public validationRewardPercentage = 8;

    /// @notice decay constant in 1e18 fixed point. 0 disables decay.
    uint256 public decayConstant;

    event ReputationChanged(address indexed user, Role indexed role, int256 delta, uint256 newScore);
    event Blacklisted(address indexed user, Role indexed role, bool status);
    event CallerAuthorized(address indexed caller, Role role);
    event AgentThresholdUpdated(uint256 newThreshold);
    event ValidatorThresholdUpdated(uint256 newThreshold);
    event DecayConstantUpdated(uint256 newK);

    constructor() Ownable(msg.sender) {}

    modifier onlyJobRegistry() {
        require(msg.sender == jobRegistry, "not authorized");
        _;
    }

    /// @notice Authorize a caller and assign its role.
    function setCaller(address caller, Role role) external onlyOwner {
        callers[caller] = role;
        if (role == Role.Agent) {
            jobRegistry = caller;
        }
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

    /// @notice Generic threshold setter to mirror v1 semantics.
    function setThreshold(Role role, uint256 threshold) external onlyOwner {
        if (role == Role.Agent) {
            agentThreshold = threshold;
            emit AgentThresholdUpdated(threshold);
        } else if (role == Role.Validator) {
            validatorThreshold = threshold;
            emit ValidatorThresholdUpdated(threshold);
        }
    }

    /// @notice Set percentage of agent gain given to validators.
    function setValidationRewardPercentage(uint256 percentage) external onlyOwner {
        require(percentage <= 100, "invalid percentage");
        validationRewardPercentage = percentage;
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
    function add(address user, uint256 amount) public {
        Role role = callers[msg.sender];
        require(role != Role.None, "not authorized");

        if (role == Role.Agent) {
            _applyDecayAgent(user);
            uint256 newScore = _enforceReputationGrowth(_agentReputation[user], amount);
            _agentReputation[user] = newScore;
            emit ReputationChanged(user, role, int256(amount), newScore);
            if (agentBlacklisted[user] && newScore >= agentThreshold) {
                agentBlacklisted[user] = false;
                emit Blacklisted(user, role, false);
            }
        } else if (role == Role.Validator) {
            _applyDecayValidator(user);
            uint256 newScore = _enforceReputationGrowth(_validatorReputation[user], amount);
            _validatorReputation[user] = newScore;
            emit ReputationChanged(user, role, int256(amount), newScore);
            if (validatorBlacklisted[user] && newScore >= validatorThreshold) {
                validatorBlacklisted[user] = false;
                emit Blacklisted(user, role, false);
            }
        }
    }

    /// @notice Wrapper for backwards compatibility.
    function addReputation(address user, uint256 amount) external {
        add(user, amount);
    }

    /// @notice Decrease reputation for the caller's role.
    function subtract(address user, uint256 amount) public {
        Role role = callers[msg.sender];
        require(role != Role.None, "not authorized");

        if (role == Role.Agent) {
            _applyDecayAgent(user);
            uint256 current = _agentReputation[user];
            uint256 newScore = current > amount ? current - amount : 0;
            _agentReputation[user] = newScore;
            emit ReputationChanged(user, role, -int256(amount), newScore);
            if (!agentBlacklisted[user] && newScore < agentThreshold) {
                agentBlacklisted[user] = true;
                emit Blacklisted(user, role, true);
            }
        } else if (role == Role.Validator) {
            _applyDecayValidator(user);
            uint256 current = _validatorReputation[user];
            uint256 newScore = current > amount ? current - amount : 0;
            _validatorReputation[user] = newScore;
            emit ReputationChanged(user, role, -int256(amount), newScore);
            if (!validatorBlacklisted[user] && newScore < validatorThreshold) {
                validatorBlacklisted[user] = true;
                emit Blacklisted(user, role, true);
            }
        }
    }

    /// @notice Wrapper for backwards compatibility.
    function subtractReputation(address user, uint256 amount) external {
        subtract(user, amount);
    }

    /// @notice Manually update blacklist status for caller's role.
    function blacklist(address user, bool status) external {
        Role role = callers[msg.sender];
        require(role != Role.None, "not authorized");
        if (role == Role.Agent) {
            agentBlacklisted[user] = status;
        } else if (role == Role.Validator) {
            validatorBlacklisted[user] = status;
        }
        emit Blacklisted(user, role, status);
    }

    /// @notice Determine if a user meets the premium access threshold.
    function canAccessPremium(address user, Role role) external view returns (bool) {
        if (role == Role.Agent) {
            return _decayed(_agentReputation[user], _agentLastUpdated[user]) >= agentThreshold && !agentBlacklisted[user];
        } else if (role == Role.Validator) {
            return _decayed(_validatorReputation[user], _validatorLastUpdated[user]) >= validatorThreshold && !validatorBlacklisted[user];
        }
        return false;
    }

    /// @notice Hook called when an agent applies for a job.
    function onApply(address agent) external onlyJobRegistry {
        _applyDecayAgent(agent);
        require(!agentBlacklisted[agent], "Blacklisted agent");
        require(_agentReputation[agent] >= agentThreshold, "insufficient reputation");
    }

    /// @notice Hook called when a job finalizes for an agent.
    /// @param agent The agent involved
    /// @param success Whether the job succeeded
    /// @param payout Job payout in wei
    /// @param completionTime Duration of the job in seconds
    function onFinalize(
        address agent,
        bool success,
        uint256 payout,
        uint256 completionTime
    ) external onlyJobRegistry {
        _applyDecayAgent(agent);
        if (success) {
            uint256 gain = calculateReputationPoints(payout, completionTime);
            uint256 newScore = _enforceReputationGrowth(_agentReputation[agent], gain);
            _agentReputation[agent] = newScore;
            emit ReputationChanged(agent, Role.Agent, int256(gain), newScore);
            if (agentBlacklisted[agent] && newScore >= agentThreshold) {
                agentBlacklisted[agent] = false;
                emit Blacklisted(agent, Role.Agent, false);
            }
        } else if (_agentReputation[agent] < agentThreshold) {
            agentBlacklisted[agent] = true;
            emit Blacklisted(agent, Role.Agent, true);
        }
    }

    /// @notice Reward a validator based on an agent's reputation gain.
    /// @param validator The validator address
    /// @param agentGain Reputation points awarded to the agent
    function rewardValidator(address validator, uint256 agentGain) external onlyJobRegistry {
        _applyDecayValidator(validator);
        uint256 gain = calculateValidatorReputationPoints(agentGain);
        uint256 newScore = _enforceReputationGrowth(_validatorReputation[validator], gain);
        _validatorReputation[validator] = newScore;
        emit ReputationChanged(validator, Role.Validator, int256(gain), newScore);
        if (validatorBlacklisted[validator] && newScore >= validatorThreshold) {
            validatorBlacklisted[validator] = false;
            emit Blacklisted(validator, Role.Validator, false);
        }
    }

    /// @notice Compute reputation gain based on payout and duration.
    function calculateReputationPoints(uint256 payout, uint256 duration) public pure returns (uint256) {
        uint256 scaledPayout = payout / 1e18;
        uint256 payoutPoints = (scaledPayout ** 3) / 1e5;
        return log2(1 + payoutPoints * 1e6) + duration / 10000;
    }

    /// @notice Compute validator reputation gain from agent gain.
    function calculateValidatorReputationPoints(uint256 agentReputationGain) public view returns (uint256) {
        return (agentReputationGain * validationRewardPercentage) / 100;
    }

    /// @notice Log base 2 implementation from v1.
    function log2(uint256 x) public pure returns (uint256 y) {
        assembly {
            let arg := x
            x := sub(x, 1)
            x := or(x, div(x, 0x02))
            x := or(x, div(x, 0x04))
            x := or(x, div(x, 0x10))
            x := or(x, div(x, 0x100))
            x := or(x, div(x, 0x10000))
            x := or(x, div(x, 0x100000000))
            x := or(x, div(x, 0x10000000000000000))
            x := or(x, div(x, 0x100000000000000000000000000000000))
            x := add(x, 1)
            y := 0
            for { let shift := 128 } gt(shift, 0) { shift := div(shift, 2) } {
                let temp := shr(shift, x)
                if gt(temp, 0) {
                    x := temp
                    y := add(y, shift)
                }
            }
        }
    }

    /// @notice Apply diminishing returns and cap to reputation growth.
    function _enforceReputationGrowth(uint256 currentReputation, uint256 points) internal pure returns (uint256) {
        uint256 newReputation = currentReputation + points;
        uint256 numerator = newReputation * newReputation * 1e18;
        uint256 denominator = maxReputation * maxReputation;
        uint256 factor = 1e18 + (numerator / denominator);
        uint256 diminishedReputation = (newReputation * 1e18) / factor;
        if (diminishedReputation > maxReputation) {
            return maxReputation;
        }
        return diminishedReputation;
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

