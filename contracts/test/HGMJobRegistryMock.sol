// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IJobRegistryControl} from "../v2/interfaces/IJobRegistryControl.sol";
import {ITaxPolicy} from "../v2/interfaces/ITaxPolicy.sol";

/// @notice Minimal harness implementing the administrative surface required by
///         {HGMControlModule} for tests.
contract HGMJobRegistryMock is IJobRegistryControl {
    address public pauserManager;
    bytes32 public agentRootNode;
    bytes32 public agentMerkleRoot;
    bytes32 public validatorRootNode;
    bytes32 public validatorMerkleRoot;
    uint256 public authCacheDuration;
    uint256 public authCacheVersionBumps;
    address public feePool;
    address public treasury;
    ITaxPolicy public taxPolicy;
    uint96 public jobStake;
    uint256 public minAgentStake;
    uint256 public feePct;
    uint256 public validatorRewardPct;
    uint256 public maxJobReward;
    uint256 public jobDurationLimit;
    uint256 public maxActiveJobsPerAgent;
    uint256 public expirationGracePeriod;

    function setPauserManager(address manager) external override {
        pauserManager = manager;
    }

    function setAgentRootNode(bytes32 node) external override {
        agentRootNode = node;
    }

    function setAgentMerkleRoot(bytes32 root) external override {
        agentMerkleRoot = root;
    }

    function setValidatorRootNode(bytes32 node) external override {
        validatorRootNode = node;
    }

    function setValidatorMerkleRoot(bytes32 root) external override {
        validatorMerkleRoot = root;
    }

    function bumpAgentAuthCacheVersion() external override {
        authCacheVersionBumps += 1;
    }

    function setAgentAuthCacheDuration(uint256 duration) external override {
        authCacheDuration = duration;
    }

    function setFeePool(address _feePool) external override {
        feePool = _feePool;
    }

    function setTreasury(address _treasury) external override {
        treasury = _treasury;
    }

    function setJobStake(uint96 stake) external override {
        jobStake = stake;
    }

    function setMinAgentStake(uint256 stake) external override {
        minAgentStake = stake;
    }

    function setFeePct(uint256 pct) external override {
        feePct = pct;
    }

    function setValidatorRewardPct(uint256 pct) external override {
        validatorRewardPct = pct;
    }

    function setMaxJobReward(uint256 amount) external override {
        maxJobReward = amount;
    }

    function setJobDurationLimit(uint256 limit) external override {
        jobDurationLimit = limit;
    }

    function setMaxActiveJobsPerAgent(uint256 limit) external override {
        maxActiveJobsPerAgent = limit;
    }

    function setExpirationGracePeriod(uint256 period) external override {
        expirationGracePeriod = period;
    }

    function setTaxPolicy(ITaxPolicy policy) external override {
        taxPolicy = policy;
    }
}
