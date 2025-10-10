// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IReputationEngineV2} from "./interfaces/IReputationEngineV2.sol";
import {TOKEN_SCALE} from "./Constants.sol";

/// @title ReputationEngine
/// @notice Tracks reputation scores with blacklist enforcement.
/// Only authorised callers may update scores.
/// @dev Holds no funds and rejects ether so neither the contract nor the
///      owner ever custodies assets or incurs tax liabilities.
contract ReputationEngine is Ownable, Pausable, IReputationEngineV2 {
    error NotOwnerOrPauserManager();
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    /// @notice Scaling divisor for the cubed payout component.
    uint256 public constant PAYOUT_SCALE = 1e5;

    /// @notice Multiplier applied before the logarithm to widen reputation gain.
    /// @dev Dimensionless constant tuned for 18-decimal payouts. Since `payout`
    ///      is first scaled down by {TOKEN_SCALE} to whole tokens, this value
    ///      does not require adjustment when changing token precision from 6 to
    ///      18 decimals.
    uint256 public constant LOG_FACTOR = 1e6;

    /// @notice Divisor applied to job duration when computing reputation gain.
    uint256 public constant DURATION_SCALE = 10_000;

    /// @notice Denominator for percentage calculations (100%).
    uint256 public constant PERCENTAGE_SCALE = 100;

    /// @notice Default percentage of agent gain awarded to validators.
    uint256 public constant DEFAULT_VALIDATION_REWARD_PERCENTAGE = 8;

    /// @notice Maximum reputation score a user can achieve.
    uint256 public constant MAX_REPUTATION = 88_888;

    /// @notice Exponent applied to payout in reputation calculations.
    uint256 public constant PAYOUT_EXPONENT = 3;

    mapping(address => uint256) public reputation;
    mapping(address => uint256) private _entropy;
    mapping(address => bool) private blacklisted;
    mapping(address => bool) public callers;
    uint256 public premiumThreshold;
    IStakeManager public stakeManager;
    uint256 public stakeWeight = TOKEN_SCALE;
    uint256 public reputationWeight = TOKEN_SCALE;
    uint256 public validationRewardPercentage = DEFAULT_VALIDATION_REWARD_PERCENTAGE;
    address public pauser;
    address public pauserManager;

    event ReputationUpdated(address indexed user, int256 delta, uint256 newScore);
    event EntropyUpdated(address indexed user, uint256 newEntropy);
    event BlacklistUpdated(address indexed user, bool status);
    event CallerUpdated(address indexed caller, bool allowed);
    event PremiumThresholdUpdated(uint256 newThreshold);
    event StakeManagerUpdated(address stakeManager);
    event ScoringWeightsUpdated(uint256 stakeWeight, uint256 reputationWeight);
    event ModulesUpdated(address indexed stakeManager);
    event ValidationRewardPercentageUpdated(uint256 percentage);
    event PauserUpdated(address indexed pauser);
    event PauserManagerUpdated(address indexed pauserManager);

    error ArrayLengthMismatch();

    modifier onlyOwnerOrPauser() {
        require(
            msg.sender == owner() || msg.sender == pauser,
            "owner or pauser only"
        );
        _;
    }

    function setPauser(address _pauser) external {
        if (msg.sender != owner() && msg.sender != pauserManager) {
            revert NotOwnerOrPauserManager();
        }
        pauser = _pauser;
        emit PauserUpdated(_pauser);
    }

    function setPauserManager(address manager) external onlyOwner {
        pauserManager = manager;
        emit PauserManagerUpdated(manager);
    }
    constructor(IStakeManager _stakeManager) Ownable(msg.sender) {
        require(address(_stakeManager) != address(0), "invalid stake manager");
        require(_stakeManager.version() == 2, "incompatible version");
        stakeManager = _stakeManager;
        emit StakeManagerUpdated(address(_stakeManager));
        emit ModulesUpdated(address(_stakeManager));
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
        require(address(manager) != address(0), "invalid stake manager");
        require(manager.version() == 2, "incompatible version");
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
        emit ModulesUpdated(address(manager));
    }

    /// @notice Configure weighting factors for stake and reputation.
    /// @param stakeW Weight applied to stake (scaled by TOKEN_SCALE)
    /// @param repW Weight applied to reputation (scaled by TOKEN_SCALE)
    function setScoringWeights(uint256 stakeW, uint256 repW) external onlyOwner {
        stakeWeight = stakeW;
        reputationWeight = repW;
        emit ScoringWeightsUpdated(stakeW, repW);
    }

    /// @notice Set percentage of agent gain given to validators.
    function setValidationRewardPercentage(uint256 percentage) external onlyOwner {
        require(percentage <= PERCENTAGE_SCALE, "invalid percentage");
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
        _increaseReputation(user, amount);
    }

    /// @notice Decrease reputation for a user.
    function subtract(address user, uint256 amount) external onlyCaller whenNotPaused {
        _decreaseReputation(user, amount);
    }

    /// @notice Adjust reputation by a signed delta.
    /// @dev Negative values reduce reputation and may trigger blacklisting.
    ///      Positive values increase reputation with diminishing returns and
    ///      may clear an existing blacklist if the new score meets the
    ///      premium threshold.
    /// @param user The account whose reputation is modified.
    /// @param delta Signed change to apply.
    function update(address user, int256 delta) external override onlyCaller whenNotPaused {
        if (delta > 0) {
            _increaseReputation(user, uint256(delta));
        } else if (delta < 0) {
            uint256 amount = uint256(-delta);
            _decreaseReputation(user, amount);
            _entropy[user] += amount;
            emit EntropyUpdated(user, _entropy[user]);
        }
    }

    /// @notice Internal helper to increase reputation and handle blacklist logic.
    function _increaseReputation(address user, uint256 amount) internal {
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

    /// @notice Internal helper to decrease reputation and manage blacklists.
    function _decreaseReputation(address user, uint256 amount) internal {
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

    /// @notice Retrieve accumulated entropy penalties for a user.
    function entropy(address user) public view returns (uint256) {
        return _entropy[user];
    }

    /// @notice Alias for {entropy}.
    function getEntropy(address user) external view returns (uint256) {
        return _entropy[user];
    }

    /// @notice Backwards compatible view for legacy naming.
    function entropyOf(address user) external view returns (uint256) {
        return _entropy[user];
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
    function onApply(address user) external view onlyCaller whenNotPaused {
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
        _finalizeAgent(user, success, payout, duration);
    }

    /// @notice Reward a validator based on an agent's reputation gain.
    /// @param validator The validator address
    /// @param agentGain Reputation points awarded to the agent
    function rewardValidator(address validator, uint256 agentGain) external onlyCaller whenNotPaused {
        _rewardValidator(validator, agentGain);
    }

    /// @notice Update agent and validator reputation for a completed job.
    function updateScores(
        uint256,
        address agent,
        address[] calldata validators,
        bool success,
        bool[] calldata validatorRevealed,
        bool[] calldata validatorVotes,
        uint256 payout,
        uint256 duration
    ) external onlyCaller whenNotPaused {
        uint256 length = validators.length;
        if (length != validatorRevealed.length || length != validatorVotes.length) {
            revert ArrayLengthMismatch();
        }

        uint256 agentGain = _finalizeAgent(agent, success, payout, duration);

        for (uint256 i; i < length;) {
            address validator = validators[i];
            if (!validatorRevealed[i]) {
                _decreaseReputation(validator, 1);
            } else if (validatorVotes[i] != success) {
                _decreaseReputation(validator, 1);
            } else if (success) {
                _rewardValidator(validator, agentGain);
            }
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Compute reputation gain based on payout and duration.
    function calculateReputationPoints(uint256 payout, uint256 duration) public pure returns (uint256) {
        // Convert the 18-decimal payout into whole tokens so subsequent math
        // remains independent of token precision.
        uint256 scaledPayout = payout / TOKEN_SCALE;
        uint256 payoutPoints = (scaledPayout ** PAYOUT_EXPONENT) / PAYOUT_SCALE;
        return log2(1 + payoutPoints * LOG_FACTOR) + duration / DURATION_SCALE;
    }

    /// @notice Compute validator reputation gain from agent gain.
    function calculateValidatorReputationPoints(uint256 agentReputationGain) public view returns (uint256) {
        return (agentReputationGain * validationRewardPercentage) / PERCENTAGE_SCALE;
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
        uint256 numerator = newReputation * newReputation * TOKEN_SCALE;
        uint256 denominator = MAX_REPUTATION * MAX_REPUTATION;
        uint256 factor = TOKEN_SCALE + (numerator / denominator);
        uint256 diminishedReputation = (newReputation * TOKEN_SCALE) / factor;
        if (diminishedReputation > MAX_REPUTATION) {
            return MAX_REPUTATION;
        }
        return diminishedReputation;
    }

    function _finalizeAgent(
        address user,
        bool success,
        uint256 payout,
        uint256 duration
    ) internal returns (uint256 agentGain) {
        uint256 points = calculateReputationPoints(payout, duration);
        if (success) {
            agentGain = points;
            uint256 current = reputation[user];
            uint256 newScore = _enforceReputationGrowth(current, points);
            reputation[user] = newScore;
            uint256 delta = newScore - current;
            emit ReputationUpdated(user, int256(delta), newScore);
            if (blacklisted[user] && newScore >= premiumThreshold) {
                blacklisted[user] = false;
                emit BlacklistUpdated(user, false);
            }
        } else {
            uint256 current = reputation[user];
            uint256 newScore = current > points ? current - points : 0;
            reputation[user] = newScore;
            uint256 delta = current - newScore;
            emit ReputationUpdated(user, -int256(delta), newScore);
            if (!blacklisted[user] && newScore < premiumThreshold) {
                blacklisted[user] = true;
                emit BlacklistUpdated(user, true);
            }
        }
    }

    function _rewardValidator(address validator, uint256 agentGain) internal {
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

    /// @notice Return the combined operator score based on stake and reputation.
    /// @dev Blacklisted users score 0.
    function getOperatorScore(address operator) external view returns (uint256) {
        if (blacklisted[operator]) return 0;
        uint256 stake;
        if (address(stakeManager) != address(0)) {
            stake = stakeManager.stakeOf(operator, IStakeManager.Role.Agent);
        }
        uint256 rep = reputation[operator];
        return ((stake * stakeWeight) + (rep * reputationWeight)) / TOKEN_SCALE;
    }

    /// @notice Confirms the contract and its owner cannot incur tax obligations.
    /// @return Always true, signalling perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    function pause() external onlyOwnerOrPauser {
        _pause();
    }

    function unpause() external onlyOwnerOrPauser {
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

