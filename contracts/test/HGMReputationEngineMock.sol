// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IReputationEngineControl} from "../v2/interfaces/IReputationEngineControl.sol";
import {IStakeManager} from "../v2/interfaces/IStakeManager.sol";

contract HGMReputationEngineMock is IReputationEngineControl {
    address public pauser;
    address public pauserManager;
    uint256 public stakeWeight;
    uint256 public reputationWeight;
    uint256 public premiumThreshold;
    uint256 public validationRewardPercentage;
    IStakeManager public stakeManager;
    mapping(address => bool) public callers;
    mapping(address => bool) public blacklist;

    function setPauser(address _pauser) external override {
        pauser = _pauser;
    }

    function setPauserManager(address manager) external override {
        pauserManager = manager;
    }

    function setScoringWeights(uint256 stakeW, uint256 repW) external override {
        stakeWeight = stakeW;
        reputationWeight = repW;
    }

    function setPremiumThreshold(uint256 threshold) external override {
        premiumThreshold = threshold;
    }

    function setValidationRewardPercentage(uint256 percentage) external override {
        validationRewardPercentage = percentage;
    }

    function setCaller(address caller, bool allowed) external override {
        callers[caller] = allowed;
    }

    function setBlacklist(address user, bool status) external override {
        blacklist[user] = status;
    }

    function setStakeManager(IStakeManager manager) external override {
        stakeManager = manager;
    }
}
