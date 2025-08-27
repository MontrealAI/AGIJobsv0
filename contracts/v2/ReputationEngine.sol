// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";

/// @title ReputationEngine
/// @notice Tracks reputation scores with blacklist enforcement.
/// Only authorised callers may update scores.
/// @dev Holds no funds and rejects ether so neither the contract nor the
///      owner ever custodies assets or incurs tax liabilities.
contract ReputationEngine is Ownable, Pausable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 1;

    mapping(address => uint256) public reputation;
    mapping(address => bool) private blacklisted;
    mapping(address => bool) public callers;
    uint256 public premiumThreshold;
    IStakeManager public stakeManager;
    uint256 public stakeWeight = 1e18;
    uint256 public reputationWeight = 1e18;
    uint256 public validationRewardPercentage = 8;

    event ReputationUpdated(address indexed user, int256 delta, uint256 newScore);
    event BlacklistUpdated(address indexed user, bool status);
    event CallerUpdated(address indexed caller, bool allowed);
    event PremiumThresholdUpdated(uint256 newThreshold);
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
    function setCaller(address caller, bool allowed) public onlyOwner {
        callers[caller] = allowed;
        emit CallerUpdated(caller, allowed);
    }

    /// @notice Backwards compatible alias for {setCaller}.
    function setAuthorizedCaller(address caller, bool allowed) external onlyOwner {
        setCaller(caller, allowed);
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
    function setPremiumThreshold(uint256 newThreshold) public onlyOwner {
        premiumThreshold = newThreshold;
        emit PremiumThresholdUpdated(newThreshold);
    }

    /// @notice Backwards compatible threshold setter.
    function setThreshold(uint256 newThreshold) external onlyOwner {
        setPremiumThreshold(newThreshold);
    }

    /// @notice Update blacklist status for a user.
    function setBlacklist(address user, bool status) public onlyOwner {
        blacklisted[user] = status;
        emit BlacklistUpdated(user, status);
    }

    /// @notice Backwards compatible blacklist setter.
    function blacklist(address user, bool status) external onlyOwner {
        setBlacklist(user, status);
    }

    /// @notice Increase reputation for a user.
    /// @dev Blacklisted users may gain reputation to clear their status.
    function add(address user, uint256 amount) external onlyCaller whenNotPaused {
        uint256 current = reputation[user];
        uint256 newScore = _enforceReputationGrowth(current, amount);
        uint256 delta = newScore - current;
        reputation[user] = newScore;
        emit ReputationUpdated(user, int256(delta), newScore);

        if (blacklisted[user] && newScore >= premiumThreshold) {
            blacklisted[user] = false;
            emit BlacklistUpdated(user, false);
        }
    }

    /// @notice Decrease reputation for a user.
    function subtract(address user, uint256 amount) external onlyCaller whenNotPaused {
        uint256 current = reputation[user];
        uint256 newScore = current > amount ? current - amount : 0;
        reputation[user] = newScore;
        uint256 delta = current - newScore;
        emit ReputationUpdated(user, -int256(delta), newScore);

        if (!blacklisted[user] && newScore < premiumThreshold) {
            blacklisted[user] = true;
            emit BlacklistUpdated(user, true);
        }
    }

    function getReputation(address user) external view returns (uint256) {
        return reputation[user];
    }

    /// @notice Alias for {reputation}.
    function reputationOf(address user) external view returns (uint256) {
        return reputation[user];
    }

    /// @notice Expose blacklist status for a user.
    function isBlacklisted(address user) external view returns (bool) {
        return blacklisted[user];
    }

    /// @notice Determine whether a user meets the premium access threshold.
    function meetsThreshold(address user) external view returns (bool) {
        return reputation[user] >= premiumThreshold;
    }

    /// @notice Backwards compatible view for legacy naming.
    function canAccessPremium(address user) external view returns (bool) {
        return reputation[user] >= premiumThreshold;
    }

    // ---------------------------------------------------------------------
    // Job lifecycle hooks
    // ---------------------------------------------------------------------

    /// @notice Ensure an applicant meets premium requirements and is not blacklisted.
    function onApply(address user) external onlyCaller whenNotPaused {
        require(!blacklisted[user], "Blacklisted agent");
        require(reputation[user] >= premiumThreshold, "insufficient reputation");
    }

    /// @notice Finalise a job and update reputation using v1 formulas.
    function onFinalize(
        address user,
        bool success,
        uint256 payout,
        uint256 duration
    ) external onlyCaller whenNotPaused {
        if (success) {
            uint256 gain = calculateReputationPoints(payout, duration);
            uint256 current = reputation[user];
            uint256 newScore = _enforceReputationGrowth(current, gain);
            reputation[user] = newScore;
            uint256 delta = newScore - current;
            emit ReputationUpdated(user, int256(delta), newScore);
            if (blacklisted[user] && newScore >= premiumThreshold) {
                blacklisted[user] = false;
                emit BlacklistUpdated(user, false);
            }
        } else {
            uint256 penalty = calculateReputationPoints(payout, duration);
            uint256 current = reputation[user];
            uint256 newScore = current > penalty ? current - penalty : 0;
            reputation[user] = newScore;
            uint256 delta = current - newScore;
            emit ReputationUpdated(user, -int256(delta), newScore);

            if (!blacklisted[user] && newScore < premiumThreshold) {
                blacklisted[user] = true;
                emit BlacklistUpdated(user, true);
            }
        }
    }

    /// @notice Reward a validator based on an agent's reputation gain.
    /// @param validator The validator address
    /// @param agentGain Reputation points awarded to the agent
    function rewardValidator(address validator, uint256 agentGain) external onlyCaller whenNotPaused {
        uint256 gain = calculateValidatorReputationPoints(agentGain);
        uint256 current = reputation[validator];
        uint256 newScore = _enforceReputationGrowth(current, gain);
        reputation[validator] = newScore;
        uint256 delta = newScore - current;
        emit ReputationUpdated(validator, int256(delta), newScore);
        if (blacklisted[validator] && newScore >= premiumThreshold) {
            blacklisted[validator] = false;
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
        if (blacklisted[operator]) return 0;
        uint256 stake;
        if (address(stakeManager) != address(0)) {
            stake = stakeManager.stakeOf(operator, IStakeManager.Role.Agent);
        }
        uint256 rep = reputation[operator];
        return ((stake * stakeWeight) + (rep * reputationWeight)) / 1e18;
    }

    /// @notice Confirms the contract and its owner cannot incur tax obligations.
    /// @return Always true, signalling perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
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

