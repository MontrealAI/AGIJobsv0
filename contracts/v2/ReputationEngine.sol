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
    mapping(address => bool) private _blacklisted;
    mapping(address => bool) public callers;
    uint256 public threshold;
    IStakeManager public stakeManager;
    uint256 public stakeWeight = 1e18;
    uint256 public reputationWeight = 1e18;

    event ReputationChanged(address indexed user, int256 delta, uint256 newScore);
    event Blacklisted(address indexed user, bool status);
    event CallerUpdated(address indexed caller, bool allowed);
    event ThresholdUpdated(uint256 newThreshold);
    event StakeManagerUpdated(address stakeManager);
    event ScoringWeightsUpdated(uint256 stakeWeight, uint256 reputationWeight);
    event ModulesUpdated(address indexed stakeManager);
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

    /// @notice Authorize or revoke a caller.
    function setCaller(address caller, bool allowed) external onlyOwner {
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

    /// @notice Increase reputation for a user.
    function add(address user, uint256 amount) external onlyCaller {
        uint256 newScore = _scores[user] + amount;
        _scores[user] = newScore;
        emit ReputationChanged(user, int256(amount), newScore);

        if (_blacklisted[user] && newScore >= threshold) {
            _blacklisted[user] = false;
            emit Blacklisted(user, false);
        }
    }

    /// @notice Decrease reputation for a user.
    function subtract(address user, uint256 amount) external onlyCaller {
        uint256 current = _scores[user];
        uint256 newScore = current > amount ? current - amount : 0;
        _scores[user] = newScore;
        emit ReputationChanged(user, -int256(amount), newScore);

        if (!_blacklisted[user] && newScore < threshold) {
            _blacklisted[user] = true;
            emit Blacklisted(user, true);
        }
    }

    /// @notice Get reputation score for a user.
    function reputation(address user) public view returns (uint256) {
        return _scores[user];
    }

    function getReputation(address user) external view returns (uint256) {
        return reputation(user);
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

