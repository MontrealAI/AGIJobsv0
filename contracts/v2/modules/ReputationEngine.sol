// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationEngine (module)
/// @notice Tracks reputation for agents and validators with premium gating
///         and blacklist enforcement.
/// @dev Holds no funds and rejects ether so neither the contract nor owner
///      incur tax obligations.
contract ReputationEngine is Ownable {
    /// @notice participant roles
    enum Role {
        Agent,
        Validator
    }

    /// @dev reputation score per role per user
    mapping(Role => mapping(address => uint256)) private _reputation;
    /// @dev blacklist status per user
    mapping(address => bool) private _blacklist;
    /// @dev authorised modules allowed to update scores
    mapping(address => bool) public callers;

    /// @notice minimum reputation required for premium access
    uint256 public premiumThreshold;
    /// @notice percentage of agent gain awarded to validators
    uint256 public validationRewardPercentage = 8;

    /// @notice maximum attainable reputation
    uint256 public constant maxReputation = 88_888;

    event ReputationUpdated(Role indexed role, address indexed user, int256 delta, uint256 newScore);
    event BlacklistUpdated(address indexed user, bool status);
    event CallerUpdated(address indexed caller, bool allowed);
    event PremiumThresholdUpdated(uint256 newThreshold);
    event ValidationRewardPercentageUpdated(uint256 percentage);

    constructor() Ownable(msg.sender) {}

    modifier onlyCaller() {
        require(callers[msg.sender], "not authorized");
        _;
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Authorize or revoke a caller module.
    function setCaller(address module, bool allowed) external onlyOwner {
        callers[module] = allowed;
        emit CallerUpdated(module, allowed);
    }

    /// @notice Set percentage of agent gain given to validators.
    function setValidationRewardPercentage(uint256 percentage) external onlyOwner {
        require(percentage <= 100, "invalid percentage");
        validationRewardPercentage = percentage;
        emit ValidationRewardPercentageUpdated(percentage);
    }

    /// @notice Set reputation threshold for premium access.
    function setPremiumThreshold(uint256 newThreshold) external onlyOwner {
        premiumThreshold = newThreshold;
        emit PremiumThresholdUpdated(newThreshold);
    }

    /// @notice Manually update blacklist status for a user.
    function blacklist(address user, bool status) external onlyOwner {
        _blacklist[user] = status;
        emit BlacklistUpdated(user, status);
    }

    // ---------------------------------------------------------------------
    // Reputation management
    // ---------------------------------------------------------------------

    /// @notice Increase reputation for a user and role.
    function add(Role role, address user, uint256 amount) external onlyCaller {
        require(!_blacklist[user], "Blacklisted agent");
        uint256 current = _reputation[role][user];
        uint256 newScore = _enforceReputationGrowth(current, amount);
        uint256 delta = newScore - current;
        _reputation[role][user] = newScore;
        emit ReputationUpdated(role, user, int256(delta), newScore);

        if (_blacklist[user] && newScore >= premiumThreshold) {
            _blacklist[user] = false;
            emit BlacklistUpdated(user, false);
        }
    }

    /// @notice Decrease reputation for a user and role.
    function subtract(Role role, address user, uint256 amount) external onlyCaller {
        uint256 current = _reputation[role][user];
        uint256 newScore = current > amount ? current - amount : 0;
        _reputation[role][user] = newScore;
        uint256 delta = current - newScore;
        emit ReputationUpdated(role, user, -int256(delta), newScore);

        if (!_blacklist[user] && newScore < premiumThreshold) {
            _blacklist[user] = true;
            emit BlacklistUpdated(user, true);
        }
    }

    // ---------------------------------------------------------------------
    // Job lifecycle hooks
    // ---------------------------------------------------------------------

    /// @notice Ensure an applicant meets premium requirements and is not blacklisted.
    function onApply(address agent) external onlyCaller {
        require(!_blacklist[agent], "Blacklisted agent");
        require(_reputation[Role.Agent][agent] >= premiumThreshold, "insufficient reputation");
    }

    /// @notice Finalise a job and update reputation using v1 formulas.
    function onFinalize(
        address agent,
        bool success,
        uint256 payout,
        uint256 duration
    ) external onlyCaller {
        require(!_blacklist[agent], "Blacklisted agent");
        if (success) {
            uint256 gain = calculateReputationPoints(payout, duration);
            uint256 current = _reputation[Role.Agent][agent];
            uint256 newScore = _enforceReputationGrowth(current, gain);
            _reputation[Role.Agent][agent] = newScore;
            uint256 delta = newScore - current;
            emit ReputationUpdated(Role.Agent, agent, int256(delta), newScore);
            if (_blacklist[agent] && newScore >= premiumThreshold) {
                _blacklist[agent] = false;
                emit BlacklistUpdated(agent, false);
            }
        } else if (_reputation[Role.Agent][agent] < premiumThreshold) {
            _blacklist[agent] = true;
            emit BlacklistUpdated(agent, true);
        }
    }

    /// @notice Reward a validator based on an agent's reputation gain.
    function rewardValidator(address validator, uint256 agentGain) external onlyCaller {
        require(!_blacklist[validator], "Blacklisted validator");
        uint256 gain = calculateValidatorReputationPoints(agentGain);
        uint256 current = _reputation[Role.Validator][validator];
        uint256 newScore = _enforceReputationGrowth(current, gain);
        _reputation[Role.Validator][validator] = newScore;
        uint256 delta = newScore - current;
        emit ReputationUpdated(Role.Validator, validator, int256(delta), newScore);
        if (_blacklist[validator] && newScore >= premiumThreshold) {
            _blacklist[validator] = false;
            emit BlacklistUpdated(validator, false);
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

    /// @notice Apply diminishing returns and cap to reputation growth using v1 formula.
    function _enforceReputationGrowth(uint256 current, uint256 points) internal pure returns (uint256) {
        uint256 newReputation = current + points;
        uint256 numerator = newReputation * newReputation * 1e18;
        uint256 denominator = maxReputation * maxReputation;
        uint256 factor = 1e18 + (numerator / denominator);
        uint256 diminishedReputation = (newReputation * 1e18) / factor;
        if (diminishedReputation > maxReputation) {
            return maxReputation;
        }
        return diminishedReputation;
    }

    /// @notice Return reputation score for a user and role.
    function getReputation(Role role, address user) public view returns (uint256) {
        return _reputation[role][user];
    }

    /// @notice Expose blacklist status for a user.
    function isBlacklisted(address user) external view returns (bool) {
        return _blacklist[user];
    }

    /// @notice Confirms the module and its owner are tax neutral.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("ReputationEngine: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("ReputationEngine: no ether");
    }
}

