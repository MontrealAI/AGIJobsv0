// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";

/// @title ReputationEngine
/// @notice Tracks reputation scores with blacklist enforcement.
/// Only authorised callers may update scores.
/// @dev Holds no funds and rejects ether so neither the contract nor the
///      owner ever custodies assets or incurs tax liabilities.
contract ReputationEngine is Ownable {
    mapping(address => uint256) private _scores;
    mapping(address => bool) public isBlacklisted;
    mapping(address => bool) public callers;
    uint256 public threshold;
    IStakeManager public stakeManager;
    uint256 public stakeWeight = 1e18;
    uint256 public reputationWeight = 1e18;
    uint256 public validationRewardPercentage = 8;

    event ReputationUpdated(address indexed user, int256 delta, uint256 newScore);
    event BlacklistUpdated(address indexed user, bool status);
    event CallerUpdated(address indexed caller, bool allowed);
    event ThresholdUpdated(uint256 newThreshold);
    event StakeManagerUpdated(address stakeManager);
    event ScoringWeightsUpdated(uint256 stakeWeight, uint256 reputationWeight);
    event ModulesUpdated(address indexed stakeManager);
    event ValidationRewardPercentageUpdated(uint256 percentage);
    constructor(IStakeManager _stakeManager) Ownable(msg.sender) {
        if (address(_stakeManager) != address(0)) {
            stakeManager = _stakeManager;
            emit StakeManagerUpdated(address(_stakeManager));
            emit ModulesUpdated(address(_stakeManager));
        }
    }

    modifier onlyCaller() {
        require(callers[msg.sender], "not authorized");
        _;
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Authorize or revoke a caller.
    function setAuthorizedCaller(address caller, bool allowed) external onlyOwner {
        callers[caller] = allowed;
        emit CallerUpdated(caller, allowed);
    }

    /// @notice Set the StakeManager used for stake lookups.
    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
        emit ModulesUpdated(address(manager));
    }

    /// @notice Configure weighting factors for stake and reputation.
    /// @param stakeW Weight applied to stake (scaled by 1e18)
    /// @param repW Weight applied to reputation (scaled by 1e18)
    function setScoringWeights(uint256 stakeW, uint256 repW) external onlyOwner {
        stakeWeight = stakeW;
        reputationWeight = repW;
        emit ScoringWeightsUpdated(stakeW, repW);
    }

    /// @notice Set percentage of agent gain given to validators.
    function setValidationRewardPercentage(uint256 percentage) external onlyOwner {
        require(percentage <= 100, "invalid percentage");
        validationRewardPercentage = percentage;
        emit ValidationRewardPercentageUpdated(percentage);
    }

    /// @notice Set reputation threshold for premium access.
    function setPremiumReputationThreshold(uint256 newThreshold) public onlyOwner {
        threshold = newThreshold;
        emit ThresholdUpdated(newThreshold);
    }

    /// @notice Backwards compatible threshold setter.
    function setThreshold(uint256 newThreshold) external onlyOwner {
        setPremiumReputationThreshold(newThreshold);
    }

    /// @notice Wrapper to mirror legacy naming.
    function setPremiumThreshold(uint256 newThreshold) external onlyOwner {
        setPremiumReputationThreshold(newThreshold);
    }

    /// @notice Update blacklist status for a user.
    function setBlacklist(address user, bool status) public onlyOwner {
        isBlacklisted[user] = status;
        emit BlacklistUpdated(user, status);
    }

    /// @notice Backwards compatible blacklist setter.
    function blacklist(address user, bool status) external onlyOwner {
        setBlacklist(user, status);
    }

    /// @notice Increase reputation for a user.
    function add(address user, uint256 amount) external onlyCaller {
        uint256 current = _scores[user];
        uint256 newScore = _enforceReputationGrowth(current, amount);
        uint256 delta = newScore - current;
        _scores[user] = newScore;
        emit ReputationUpdated(user, int256(delta), newScore);

        if (isBlacklisted[user] && newScore >= threshold) {
            isBlacklisted[user] = false;
            emit BlacklistUpdated(user, false);
        }
    }

    /// @notice Decrease reputation for a user.
    function subtract(address user, uint256 amount) external onlyCaller {
        uint256 current = _scores[user];
        uint256 newScore = current > amount ? current - amount : 0;
        _scores[user] = newScore;
        emit ReputationUpdated(user, -int256(amount), newScore);

        if (!isBlacklisted[user] && newScore < threshold) {
            isBlacklisted[user] = true;
            emit BlacklistUpdated(user, true);
        }
    }

    /// @notice Get reputation score for a user.
    function reputation(address user) public view returns (uint256) {
        return _scores[user];
    }

    function getReputation(address user) external view returns (uint256) {
        return reputation(user);
    }

    /// @notice Alias for {reputation}.
    function reputationOf(address user) external view returns (uint256) {
        return _scores[user];
    }

    /// @notice Determine whether a user meets the premium access threshold.
    function meetsThreshold(address user) external view returns (bool) {
        return _scores[user] >= threshold;
    }

    /// @notice Backwards compatible view for legacy naming.
    function canAccessPremium(address user) external view returns (bool) {
        return _scores[user] >= threshold;
    }

    // ---------------------------------------------------------------------
    // Job lifecycle hooks
    // ---------------------------------------------------------------------

    /// @notice Ensure an applicant meets premium requirements and is not blacklisted.
    function onApply(address user) external onlyCaller {
        require(!isBlacklisted[user], "Blacklisted agent");
        require(_scores[user] >= threshold, "insufficient reputation");
    }

    /// @notice Finalise a job and update reputation using v0 formulas.
    function onFinalize(
        address user,
        bool success,
        uint256 payout,
        uint256 duration
    ) external onlyCaller {
        if (success) {
            uint256 gain = calculateReputationPoints(payout, duration);
            uint256 newScore = _enforceReputationGrowth(_scores[user], gain);
            _scores[user] = newScore;
            emit ReputationUpdated(user, int256(gain), newScore);
            if (isBlacklisted[user] && newScore >= threshold) {
                isBlacklisted[user] = false;
                emit BlacklistUpdated(user, false);
            }
        } else if (_scores[user] < threshold) {
            isBlacklisted[user] = true;
            emit BlacklistUpdated(user, true);
        }
    }

    /// @notice Reward a validator based on an agent's reputation gain.
    /// @param validator The validator address
    /// @param agentGain Reputation points awarded to the agent
    function rewardValidator(address validator, uint256 agentGain) external onlyCaller {
        uint256 gain = calculateValidatorReputationPoints(agentGain);
        uint256 newScore = _enforceReputationGrowth(_scores[validator], gain);
        _scores[validator] = newScore;
        emit ReputationUpdated(validator, int256(gain), newScore);
        if (isBlacklisted[validator] && newScore >= threshold) {
            isBlacklisted[validator] = false;
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

    uint256 public constant maxReputation = 88_888;

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

    /// @notice Return the combined operator score based on stake and reputation.
    /// @dev Blacklisted users score 0.
    function getOperatorScore(address operator) external view returns (uint256) {
        if (isBlacklisted[operator]) return 0;
        uint256 stake;
        if (address(stakeManager) != address(0)) {
            stake = stakeManager.stakeOf(operator, IStakeManager.Role.Agent);
        }
        uint256 rep = _scores[operator];
        return ((stake * stakeWeight) + (rep * reputationWeight)) / 1e18;
    }

    /// @notice Confirms the contract and its owner cannot incur tax obligations.
    /// @return Always true, signalling perpetual tax exemption.
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

