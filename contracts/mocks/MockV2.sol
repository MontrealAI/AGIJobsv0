// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../v2/interfaces/IStakeManager.sol";
import "../v2/interfaces/IJobRegistry.sol";
import "../v2/interfaces/IJobRegistryTax.sol";
import "../v2/interfaces/IReputationEngine.sol";
import "../v2/interfaces/IDisputeModule.sol";

contract MockStakeManager is IStakeManager {
    mapping(address => mapping(Role => uint256)) private _stakes;
    mapping(Role => uint256) public totalStakes;
    address public disputeModule;
    address public override jobRegistry;

    function setJobRegistry(address j) external { jobRegistry = j; }

    function setStake(address user, Role role, uint256 amount) external {
        totalStakes[role] = totalStakes[role] - _stakes[user][role] + amount;
        _stakes[user][role] = amount;
    }

    function depositStake(Role, uint256) external override {}
    function acknowledgeAndDeposit(Role, uint256) external override {}
    function depositStakeFor(address, Role, uint256) external override {}
    function acknowledgeAndWithdraw(Role, uint256) external override {}
    function withdrawStake(Role, uint256) external override {}
    function lockJobFunds(bytes32, address, uint256) external override {}
    function releaseJobFunds(bytes32, address, uint256) external override {}
    function finalizeJobFunds(bytes32, address, uint256, uint256, IFeePool) external override {}
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
        totalStakes[role] -= amount;
    }

    function stakeOf(address user, Role role) external view override returns (uint256) {
        return _stakes[user][role];
    }

    function totalStake(Role role) external view override returns (uint256) {
        return totalStakes[role];
    }

    function setToken(address) external {}
}

contract MockJobRegistry is IJobRegistry, IJobRegistryTax {
    mapping(uint256 => Job) private _jobs;
    uint256 public taxPolicyVersion;
    mapping(address => uint256) public taxAcknowledgedVersion;
    address private _stakeManager;
    address public disputeModule;

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
    function setDisputeModule(address module) external override {
        disputeModule = module;
    }
    function setJobParameters(uint256, uint256) external override {}
    function createJob(uint256, string calldata) external override returns (uint256) {return 0;}
      function applyForJob(uint256) external override {}
      function stakeAndApply(uint256, uint256) external override {}
      function acknowledgeAndApply(uint256) external override {}
      function completeJob(uint256) external override {}
      function acknowledgeAndCompleteJob(uint256) external override {}
    function dispute(uint256) external payable override {}
    function acknowledgeAndDispute(uint256, string calldata) external override {}
    function resolveDispute(uint256, bool) external override {}
    function raiseDispute(uint256 jobId, string calldata evidence) external {
        IDisputeModule(disputeModule).raiseDispute(jobId, evidence);
    }
    function finalize(uint256) external override {}
    function acknowledgeAndFinalize(uint256) external override {}
    function cancelJob(uint256) external override {}

    function stakeManager() external view override returns (address) {
        return _stakeManager;
    }
}

contract MockReputationEngine is IReputationEngine {
    mapping(address => uint256) private _rep;
    mapping(address => bool) private _blacklist;

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

    function getReputation(address user) external view override returns (uint256) {
        return _rep[user];
    }

    function isBlacklisted(address user) external view override returns (bool) {
        return _blacklist[user];
    }

    function setCaller(address, bool) external override {}

    function setThreshold(uint256) external override {}

    function setBlacklist(address user, bool val) external override {
        _blacklist[user] = val;
    }

    function getOperatorScore(address user) external view override returns (uint256) {
        return _rep[user];
    }

    function setStakeManager(address) external override {}

    function setScoringWeights(uint256, uint256) external override {}
}
