// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../v2/interfaces/IStakeManager.sol";
import "../v2/interfaces/IValidationModule.sol";
import "../v2/interfaces/IReputationEngine.sol";
import "../v2/interfaces/IDisputeModule.sol";
import "../v2/interfaces/ICertificateNFT.sol";
import "../v2/interfaces/ITaxPolicy.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

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
    function lockStake(address, uint256, uint64) external override {}
    function lockReward(bytes32, address, uint256) external override {}
    function lock(address, uint256) external override {}
    function releaseReward(bytes32, address, uint256) external override {}
    function unlockReward(bytes32, address, uint256) external override {}
    function releaseStake(address, uint256) external override {}
    function release(address, uint256) external override {}
    function finalizeJobFunds(bytes32, address, uint256, uint256, IFeePool) external override {}
    function distributeValidatorRewards(bytes32, uint256) external override {}
    function setDisputeModule(address module) external override { disputeModule = module; }
    function setValidationModule(address) external override {}
    function setModules(address, address) external override {}
    function lockDisputeFee(address, uint256) external override {}
    function payDisputeFee(address, uint256) external override {}

    function setSlashPercentSumEnforcement(bool) external override {}
    function setToken(IERC20) external override {}
    function setMinStake(uint256) external override {}
    function setSlashingPercentages(uint256, uint256) external override {}
    function setSlashingParameters(uint256, uint256) external override {}
    function setTreasury(address) external override {}
    function setMaxStakePerAddress(uint256) external override {}
    function setMaxAGITypes(uint256) external override {}
    function setFeePct(uint256) external override {}
    function setFeePool(IFeePool) external override {}
    function setBurnPct(uint256) external override {}

    function slash(address user, Role role, uint256 amount, address) external override {
        uint256 st = _stakes[user][role];
        require(st >= amount, "stake");
        _stakes[user][role] = st - amount;
        totalStakes[role] -= amount;
    }

    function slash(address user, uint256 amount, address) external override {
        uint256 st = _stakes[user][Role.Validator];
        require(st >= amount, "stake");
        _stakes[user][Role.Validator] = st - amount;
        totalStakes[Role.Validator] -= amount;
    }

    function stakeOf(address user, Role role) external view override returns (uint256) {
        return _stakes[user][role];
    }

    function totalStake(Role role) external view override returns (uint256) {
        return totalStakes[role];
    }

    function getAgentPayoutPct(address) external pure override returns (uint256) {
        return 100;
    }

    function burnPct() external pure override returns (uint256) {
        return 0;
    }

    // legacy helper for tests
    function setTokenLegacy(address) external {}
}

contract MockJobRegistry is Ownable {
    enum State { Created, Applied, Submitted, Validated, Disputed, Finalized }

    struct Job {
        address employer;
        address agent;
        uint256 reward;
        uint256 stake;
        uint256 deadline;
        uint256 validatorApprovals;
        uint256 validatorRejections;
        bool success;
        State state;
        string uri;
        string result;
    }

    mapping(uint256 => Job) public jobs;
    uint256 public taxPolicyVersion;
    mapping(address => uint256) public taxAcknowledgedVersion;

    ITaxPolicy public taxPolicy;
    IStakeManager public stakeManager;
    IValidationModule public validationModule;
    IReputationEngine public reputationEngine;
    ICertificateNFT public certificateNFT;
    IDisputeModule public disputeModule;
    uint256 public jobStake;

    event JobApplied(uint256 indexed jobId, address indexed agent);
    event JobSubmitted(uint256 indexed jobId, address indexed worker, string result);
    event JobDisputed(uint256 indexed jobId, address indexed caller);
    event JobFinalized(uint256 indexed jobId, address worker);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event JobCancelled(uint256 indexed jobId);

    constructor() Ownable(msg.sender) {}

    function setJob(uint256 jobId, Job calldata job) external {
        jobs[jobId] = job;
    }

    // configuration helpers
    function setStakeManager(address m) external { stakeManager = IStakeManager(m); }
    function setValidationModule(address m) external { validationModule = IValidationModule(m); }
    function setReputationEngine(address m) external { reputationEngine = IReputationEngine(m); }
    function setCertificateNFT(address m) external { certificateNFT = ICertificateNFT(m); }
    function setDisputeModule(address m) external { disputeModule = IDisputeModule(m); }
    function setTaxPolicy(address p) external { taxPolicy = ITaxPolicy(p); }
    function setTaxPolicyVersion(uint256 v) external { taxPolicyVersion = v; }
    function acknowledgeTaxPolicy() external { taxAcknowledgedVersion[msg.sender] = taxPolicyVersion; }
    function setJobStake(uint96 stake) external { jobStake = stake; }

    // job lifecycle helpers
    function applyForJob(uint256 jobId, string calldata, bytes32[] calldata) public {
        Job storage job = jobs[jobId];
        job.agent = msg.sender;
        job.state = State.Applied;
        emit JobApplied(jobId, msg.sender);
    }

    function stakeAndApply(uint256 jobId, uint256, string calldata subdomain, bytes32[] calldata proof) external {
        applyForJob(jobId, subdomain, proof);
    }

    function acknowledgeAndApply(uint256 jobId, string calldata subdomain, bytes32[] calldata proof) external {
        applyForJob(jobId, subdomain, proof);
    }

    function submit(uint256 jobId, string calldata result) public {
        Job storage job = jobs[jobId];
        require(job.agent == msg.sender, "agent");
        job.result = result;
        job.state = State.Submitted;
        emit JobSubmitted(jobId, msg.sender, result);
        if (address(validationModule) != address(0)) {
            validationModule.selectValidators(jobId);
        }
    }

    function acknowledgeAndSubmit(uint256 jobId, string calldata result) external {
        submit(jobId, result);
    }

    function finalizeAfterValidation(
        uint256 jobId,
        bool success,
        uint256 approvals,
        uint256 rejections
    ) public {
        Job storage job = jobs[jobId];
        job.success = success;
        job.validatorApprovals = approvals;
        job.validatorRejections = rejections;
        job.state = success ? State.Validated : State.Disputed;
    }

    function validationComplete(
        uint256 jobId,
        bool success,
        uint256 approvals,
        uint256 rejections
    ) external {
        finalizeAfterValidation(jobId, success, approvals, rejections);
    }

    function dispute(uint256 jobId, string calldata) public {
        Job storage job = jobs[jobId];
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute(jobId, msg.sender);
        }
        job.state = State.Disputed;
        emit JobDisputed(jobId, msg.sender);
    }

    function raiseDispute(uint256 jobId, string calldata evidence) external {
        dispute(jobId, evidence);
    }

    function acknowledgeAndDispute(uint256 jobId, string calldata evidence) external {
        dispute(jobId, evidence);
    }

    function resolveDispute(uint256 jobId, bool employerWins) external {
        Job storage job = jobs[jobId];
        job.success = !employerWins;
        job.state = State.Finalized;
        emit DisputeResolved(jobId, employerWins);
        emit JobFinalized(jobId, job.agent);
    }

    function finalize(uint256 jobId) public {
        Job storage job = jobs[jobId];
        job.state = State.Finalized;
        emit JobFinalized(jobId, job.agent);
    }

    function acknowledgeAndFinalize(uint256 jobId) external {
        finalize(jobId);
    }

    function cancelJob(uint256 jobId) public {
        jobs[jobId].state = State.Finalized;
        emit JobCancelled(jobId);
    }

    function forceCancel(uint256 jobId) external {
        cancelJob(jobId);
    }
}

contract MockReputationEngine is IReputationEngine {
    mapping(address => uint256) private _rep;
    mapping(address => bool) private _blacklist;
    uint256 public threshold;

    function add(address user, uint256 amount) external override { _rep[user] += amount; }
    function subtract(address user, uint256 amount) external override {
        uint256 rep = _rep[user];
        _rep[user] = rep > amount ? rep - amount : 0;
    }
    function reputation(address user) external view override returns (uint256) { return _rep[user]; }
    function getReputation(address user) external view override returns (uint256) { return _rep[user]; }
    function reputationOf(address user) external view override returns (uint256) { return _rep[user]; }
    function isBlacklisted(address user) external view override returns (bool) { return _blacklist[user]; }
    function meetsThreshold(address user) external view override returns (bool) { return _rep[user] >= threshold; }
    function setCaller(address, bool) external override {}
    function setAuthorizedCaller(address, bool) external override {}
    function setThreshold(uint256 t) external override { threshold = t; }
    function setPremiumReputationThreshold(uint256 t) external override { threshold = t; }
    function setBlacklist(address user, bool val) external override { _blacklist[user] = val; }
    function onApply(address user) external override {
        require(!_blacklist[user], "blacklisted");
        require(_rep[user] >= threshold, "insufficient reputation");
    }
    function onFinalize(address user, bool success, uint256, uint256) external override {
        if (success) {
            _rep[user] += 1;
        } else if (_rep[user] < threshold) {
            _blacklist[user] = true;
        }
    }
    function rewardValidator(address user, uint256) external override { _rep[user] += 1; }
    function getOperatorScore(address user) external view override returns (uint256) { return _rep[user]; }
    function setStakeManager(address) external override {}
    function setScoringWeights(uint256, uint256) external override {}
}

