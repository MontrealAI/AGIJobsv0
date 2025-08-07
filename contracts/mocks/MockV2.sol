// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../v2/interfaces/IStakeManager.sol";
import "../v2/interfaces/IJobRegistry.sol";

contract MockStakeManager is IStakeManager {
    mapping(address => uint256) private _validatorStakes;
    mapping(address => uint256) private _agentStakes;

    function setValidatorStake(address v, uint256 amount) external {
        _validatorStakes[v] = amount;
    }

    function setAgentStake(address a, uint256 amount) external {
        _agentStakes[a] = amount;
    }

    function depositAgentStake(address, uint256) external override {}
    function depositValidatorStake(address, uint256) external override {}
    function withdrawStake(uint256) external override {}

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

    function setToken(address) external override {}

    function setStakeParameters(
        uint256,
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
    function dispute(uint256) external override {}
    function resolveDispute(uint256, bool) external override {}
    function finalize(uint256) external override {}
}
