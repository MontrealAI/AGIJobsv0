// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../v2/interfaces/IStakeManager.sol";
import "../v2/interfaces/IJobRegistry.sol";
import "../v2/interfaces/IJobRegistryTax.sol";
import "../v2/interfaces/IReputationEngine.sol";

contract MockStakeManager is IStakeManager {
    mapping(address => mapping(Role => uint256)) private _stakes;
    address public disputeModule;

    function setStake(address user, Role role, uint256 amount) external {
        _stakes[user][role] = amount;
    }

    function depositStake(Role, uint256) external override {}
    function withdrawStake(Role, uint256) external override {}
    function lockJobFunds(bytes32, address, uint256) external override {}
    function releaseJobFunds(bytes32, address, uint256) external override {}
    function setDisputeModule(address module) external override {
        disputeModule = module;
    }
    function lockDisputeFee(address, uint256) external override {}
    function payDisputeFee(address, uint256) external override {}

    function setSlashPercentSumEnforcement(bool) external override {}

    function slash(address user, Role role, uint256 amount, address)
        external
        override
    {
        uint256 st = _stakes[user][role];
        require(st >= amount, "stake");
        _stakes[user][role] = st - amount;
    }

    function stakeOf(address user, Role role) external view override returns (uint256) {
        return _stakes[user][role];
    }

    function setToken(address) external {}
}

contract MockJobRegistry is IJobRegistry, IJobRegistryTax {
    mapping(uint256 => Job) private _jobs;
    uint256 public taxPolicyVersion;
    mapping(address => uint256) public taxAcknowledgedVersion;
    address private _stakeManager;

    function setJob(uint256 jobId, Job calldata job) external {
        _jobs[jobId] = job;
    }

    function jobs(uint256 jobId) external view override returns (Job memory) {
        return _jobs[jobId];
    }

    function acknowledgeTaxPolicy() external {
        taxAcknowledgedVersion[msg.sender] = taxPolicyVersion;
    }

    function setTaxPolicyVersion(uint256 version) external {
        taxPolicyVersion = version;
    }

    function setValidationModule(address) external override {}
    function setReputationEngine(address) external override {}
    function setStakeManager(address manager) external override {
        _stakeManager = manager;
    }
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

    function stakeManager() external view override returns (address) {
        return _stakeManager;
    }
}

contract MockReputationEngine is IReputationEngine {
    mapping(address => uint256) private _rep;

    function add(address user, uint256 amount) external override {
        _rep[user] += amount;
    }

    function subtract(address user, uint256 amount) external override {
        uint256 rep = _rep[user];
        _rep[user] = rep > amount ? rep - amount : 0;
    }

    function reputation(address user) external view override returns (uint256) {
        return _rep[user];
    }

    function isBlacklisted(address) external pure override returns (bool) {
        return false;
    }

    function setCaller(address, bool) external override {}

    function setThreshold(uint256) external override {}

    function setBlacklist(address, bool) external override {}
}
