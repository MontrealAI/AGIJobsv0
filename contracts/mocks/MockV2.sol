// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../v2/interfaces/IStakeManager.sol";
import "../v2/interfaces/IJobRegistry.sol";
import "../v2/interfaces/IReputationEngine.sol";

contract MockStakeManager is IStakeManager {
    mapping(address => uint256) private _validatorStakes;
    mapping(address => uint256) private _agentStakes;
    mapping(address => uint256) private _lockedValidator;
    mapping(address => uint256) private _lockedAgent;

    function setValidatorStake(address v, uint256 amount) external {
        _validatorStakes[v] = amount;
    }

    function setAgentStake(address a, uint256 amount) external {
        _agentStakes[a] = amount;
    }

    function depositStake(Role, uint256) external override {}
    function withdrawStake(Role, uint256) external override {}

    function lockStake(address user, Role role, uint256 amount) external override {
        if (role == Role.Agent) {
            require(_agentStakes[user] >= amount, "agent");
            _lockedAgent[user] += amount;
        } else {
            require(_validatorStakes[user] >= amount, "validator");
            _lockedValidator[user] += amount;
        }
    }

    function slash(address user, uint256 amount, address) external override {
        if (_validatorStakes[user] >= amount) {
            _validatorStakes[user] -= amount;
        } else if (_agentStakes[user] >= amount) {
            _agentStakes[user] -= amount;
        }
    }

    function agentStake(address agent) external view override returns (uint256) {
        return _agentStakes[agent];
    }

    function validatorStake(address validator) external view override returns (uint256) {
        return _validatorStakes[validator];
    }

    function lockedAgentStake(address agent) external view override returns (uint256) {
        return _lockedAgent[agent];
    }

    function lockedValidatorStake(address validator) external view override returns (uint256) {
        return _lockedValidator[validator];
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
    function createJob(address) external override returns (uint256) {return 0;}
    function requestJobCompletion(uint256) external override {}
    function dispute(uint256) external payable override {}
    function resolveDispute(uint256, bool) external override {}
    function finalize(uint256) external override {}
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

    function setThresholds(uint256, uint256) external override {}
}
