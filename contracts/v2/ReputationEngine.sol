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
    struct Metrics {
        uint256 completedJobs;
        uint256 disputes;
        uint256 slashes;
        uint256 score;
        uint256 lastUpdated;
    }

    mapping(address => Metrics) private _metrics;
    mapping(address => bool) private _blacklisted;
    mapping(address => bool) public callers;
    uint256 public threshold;
    IStakeManager public stakeManager;
    uint256 public stakeWeight = 1e18;
    uint256 public reputationWeight = 1e18;
    uint256 public decayRate = 1e16; // 1% per second scaled by 1e18

    uint256 public constant COMPLETION_REWARD = 1e18;
    uint256 public constant DISPUTE_PENALTY = 1e18;
    uint256 public constant SLASH_PENALTY = 1e18;

    event ReputationChanged(address indexed user, int256 delta, uint256 newScore);
    event Blacklisted(address indexed user, bool status);
    event CallerUpdated(address indexed caller, bool allowed);
    event ThresholdUpdated(uint256 newThreshold);
    event StakeManagerUpdated(address stakeManager);
    event ScoringWeightsUpdated(uint256 stakeWeight, uint256 reputationWeight);

    constructor(address owner) Ownable(owner) {}

    modifier onlyCaller() {
        require(callers[msg.sender], "not authorized");
        _;
    }

    /// @notice Authorize or revoke a caller.
    function setCaller(address caller, bool allowed) external onlyOwner {
        callers[caller] = allowed;
        emit CallerUpdated(caller, allowed);
    }

    /// @notice Set the StakeManager used for stake lookups.
    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
    }

    /// @notice Configure weighting factors for stake and reputation.
    /// @param stakeW Weight applied to stake (scaled by 1e18)
    /// @param repW Weight applied to reputation (scaled by 1e18)
    function setScoringWeights(uint256 stakeW, uint256 repW) external onlyOwner {
        stakeWeight = stakeW;
        reputationWeight = repW;
        emit ScoringWeightsUpdated(stakeW, repW);
    }

    /// @notice Set reputation threshold for automatic blacklisting.
    function setThreshold(uint256 newThreshold) external onlyOwner {
        threshold = newThreshold;
        emit ThresholdUpdated(newThreshold);
    }

    /// @notice Update blacklist status for a user.
    /// @dev Only authorised modules may call this function.
    function blacklist(address user, bool status) external onlyCaller {
        _blacklisted[user] = status;
        emit Blacklisted(user, status);
    }

    /// @dev apply linear decay to a user's score based on time elapsed
    function _applyDecay(address user) internal {
        Metrics storage m = _metrics[user];
        if (m.lastUpdated == 0) {
            m.lastUpdated = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - m.lastUpdated;
        if (elapsed > 0) {
            uint256 decay = (m.score * decayRate * elapsed) / 1e18;
            m.score = decay >= m.score ? 0 : m.score - decay;
            m.lastUpdated = block.timestamp;
        }
    }

    /// @notice Record a successfully completed job.
    function recordCompletion(address user) external onlyCaller {
        _applyDecay(user);
        Metrics storage m = _metrics[user];
        m.completedJobs += 1;
        m.score += COMPLETION_REWARD;
        emit ReputationChanged(user, int256(COMPLETION_REWARD), m.score);

        if (_blacklisted[user] && m.score >= threshold) {
            _blacklisted[user] = false;
            emit Blacklisted(user, false);
        }
    }

    /// @notice Record a dispute against a user.
    function recordDispute(address user) external onlyCaller {
        _applyDecay(user);
        Metrics storage m = _metrics[user];
        m.disputes += 1;
        uint256 penalty = DISPUTE_PENALTY;
        m.score = m.score > penalty ? m.score - penalty : 0;
        emit ReputationChanged(user, -int256(penalty), m.score);

        if (!_blacklisted[user] && m.score < threshold) {
            _blacklisted[user] = true;
            emit Blacklisted(user, true);
        }
    }

    /// @notice Record slashing of a user.
    /// @param amount Amount of slashing in reputation units (scaled by 1e18)
    function recordSlash(address user, uint256 amount) external onlyCaller {
        _applyDecay(user);
        Metrics storage m = _metrics[user];
        m.slashes += amount;
        uint256 penalty = (amount * SLASH_PENALTY) / 1e18;
        m.score = m.score > penalty ? m.score - penalty : 0;
        emit ReputationChanged(user, -int256(penalty), m.score);

        if (!_blacklisted[user] && m.score < threshold) {
            _blacklisted[user] = true;
            emit Blacklisted(user, true);
        }
    }

    /// @notice Increase reputation for a user (generic).
    function add(address user, uint256 amount) external onlyCaller {
        _applyDecay(user);
        Metrics storage m = _metrics[user];
        m.score += amount;
        emit ReputationChanged(user, int256(amount), m.score);

        if (_blacklisted[user] && m.score >= threshold) {
            _blacklisted[user] = false;
            emit Blacklisted(user, false);
        }
    }

    /// @notice Decrease reputation for a user (generic).
    function subtract(address user, uint256 amount) external onlyCaller {
        _applyDecay(user);
        Metrics storage m = _metrics[user];
        m.score = m.score > amount ? m.score - amount : 0;
        emit ReputationChanged(user, -int256(amount), m.score);

        if (!_blacklisted[user] && m.score < threshold) {
            _blacklisted[user] = true;
            emit Blacklisted(user, true);
        }
    }

    /// @notice Get reputation score for a user applying decay.
    function reputation(address user) public view returns (uint256) {
        Metrics storage m = _metrics[user];
        uint256 score = m.score;
        if (m.lastUpdated == 0) return score;
        uint256 elapsed = block.timestamp - m.lastUpdated;
        if (elapsed > 0) {
            uint256 decay = (score * decayRate * elapsed) / 1e18;
            score = decay >= score ? 0 : score - decay;
        }
        return score;
    }

    function getReputation(address user) external view returns (uint256) {
        return reputation(user);
    }

    /// @notice Return tracked metrics for a user.
    function getMetrics(address user)
        external
        view
        returns (uint256 completed, uint256 disputes, uint256 slashes)
    {
        Metrics storage m = _metrics[user];
        return (m.completedJobs, m.disputes, m.slashes);
    }

    /// @notice Check blacklist status for a user.
    function isBlacklisted(address user) external view returns (bool) {
        return _blacklisted[user];
    }

    /// @notice Return the combined operator score based on stake and reputation.
    /// @dev Blacklisted users score 0.
    function getOperatorScore(address operator) external view returns (uint256) {
        if (_blacklisted[operator]) return 0;
        uint256 stake;
        if (address(stakeManager) != address(0)) {
            stake = stakeManager.stakeOf(operator, IStakeManager.Role.Platform);
        }
        uint256 rep = reputation(operator);
        if (stake == 0 || rep == 0) return 0;
        uint256 weightedStake = (stake * stakeWeight) / 1e18;
        uint256 weightedRep = (rep * reputationWeight) / 1e18;
        return (weightedStake * weightedRep) / 1e18;
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

