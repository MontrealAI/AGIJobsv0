// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../v2/interfaces/IStakeManager.sol";
import "../v2/interfaces/IJobRegistry.sol";
import "../v2/interfaces/IReputationEngine.sol";

contract MockStakeManager is IStakeManager {
    mapping(address => mapping(Role => uint256)) private _stakes;
    mapping(address => mapping(Role => uint256)) private _locked;

    function setStake(address user, Role role, uint256 amount) external {
        _stakes[user][role] = amount;
    }

    function depositStake(Role, uint256) external override {}
    function withdrawStake(Role, uint256) external override {}

    function lockStake(address user, Role role, uint256 amount) external override {
        require(_stakes[user][role] >= amount, "stake");
        _locked[user][role] += amount;
    }

    function slash(address user, Role role, uint256 amount, address) external override {
        uint256 st = _stakes[user][role];
        require(st >= amount, "stake");
        _stakes[user][role] = st - amount;
        uint256 l = _locked[user][role];
        if (l >= amount) {
            _locked[user][role] = l - amount;
        }
    }

    function stakeOf(address user, Role role) external view override returns (uint256) {
        return _stakes[user][role];
    }

    function lockedStakeOf(address user, Role role)
        external
        view
        override
        returns (uint256)
    {
        return _locked[user][role];
    }

    function setToken(address) external override {}

    function setStakeParameters(
        uint256,
        uint256,
        uint256
    ) external override {}
}

contract MockJobRegistry is IJobRegistry {
    mapping(uint256 => Job) private _jobs;

    function setJob(uint256 jobId, Job calldata job) external {
        _jobs[jobId] = job;
    }

    function jobs(uint256 jobId) external view override returns (Job memory) {
        return _jobs[jobId];
    }

    function setValidationModule(address) external override {}
    function setReputationEngine(address) external override {}
    function setStakeManager(address) external override {}
    function setCertificateNFT(address) external override {}
    function setDisputeModule(address) external override {}
    function setJobParameters(uint256, uint256) external override {}
    function createJob() external override returns (uint256) {return 0;}
    function applyForJob(uint256) external override {}
    function completeJob(uint256) external override {}
    function dispute(uint256) external payable override {}
    function resolveDispute(uint256, bool) external override {}
    function finalize(uint256) external override {}
    function cancelJob(uint256) external override {}
}

contract MockReputationEngine is IReputationEngine {
    mapping(address => uint256) private _rep;

    function addReputation(address user, uint256 amount) external override {
        _rep[user] += amount;
    }

    function subtractReputation(address user, uint256 amount) external override {
        uint256 rep = _rep[user];
        _rep[user] = rep > amount ? rep - amount : 0;
    }

    function reputationOf(address user) external view override returns (uint256) {
        return _rep[user];
    }

    function isBlacklisted(address) external pure override returns (bool) {
        return false;
    }

    function setCaller(address, bool) external override {}

    function setRole(address, uint8) external override {}

    function setThresholds(uint256, uint256) external override {}
}
