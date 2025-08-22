// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../v2/interfaces/IStakeManager.sol";
import "../v2/interfaces/IJobRegistry.sol";
import "../v2/interfaces/IJobRegistryTax.sol";
import "../v2/interfaces/IReputationEngine.sol";
import "../v2/interfaces/IDisputeModule.sol";
import "../v2/interfaces/IValidationModule.sol";
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
    function releaseStake(address, uint256) external override {}
    function release(address, uint256) external override {}
    function finalizeJobFunds(bytes32, address, uint256, uint256, IFeePool) external override {}
    function distributeValidatorRewards(bytes32, uint256) external override {}
    function setDisputeModule(address module) external override {
        disputeModule = module;
    }
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

    function slash(address user, Role role, uint256 amount, address)
        external
        override
    {
        uint256 st = _stakes[user][role];
        require(st >= amount, "stake");
        _stakes[user][role] = st - amount;
        totalStakes[role] -= amount;
    }

    function slash(address user, uint256 amount, address)
        external
        override
    {
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

contract MockJobRegistry is Ownable, IJobRegistry, IJobRegistryTax {
    constructor() Ownable(msg.sender) {}
    mapping(uint256 => Job) private _jobs;
    uint256 public taxPolicyVersion;
    mapping(address => uint256) public taxAcknowledgedVersion;

    ITaxPolicy public taxPolicy;

    IStakeManager private _stakeManager;
    IValidationModule public validationModule;
    IReputationEngine public reputationEngine;
    ICertificateNFT public certificateNFT;
    IDisputeModule public disputeModule;

    uint256 public jobStake;
    uint256 public maxJobReward;
    uint256 public maxJobDuration;
    uint256 public feePct;
    uint256 public validatorRewardPct;
    uint256 public nextJobId;
    mapping(uint256 => uint256) public deadlines;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        uint256 reward,
        uint256 deadline
    );

    function setJob(uint256 jobId, Job calldata job) external {
        _jobs[jobId] = job;
    }

    function jobs(uint256 jobId) external view override returns (Job memory) {
        return _jobs[jobId];
    }

    function acknowledgeTaxPolicy() external {
        if (address(taxPolicy) != address(0)) {
            taxPolicy.acknowledge(msg.sender);
        }
        taxAcknowledgedVersion[msg.sender] = taxPolicyVersion;
    }

    function setTaxPolicy(address policy) external {
        taxPolicy = ITaxPolicy(policy);
    }

    function setTaxPolicyVersion(uint256 version) external {
        taxPolicyVersion = version;
    }

    function setValidationModule(address module) external override {
        validationModule = IValidationModule(module);
    }

    function setReputationEngine(address engine) external override {
        reputationEngine = IReputationEngine(engine);
    }

    function setStakeManager(address manager) external override {
        _stakeManager = IStakeManager(manager);
    }

    function stakeManager() external view override returns (address) {
        return address(_stakeManager);
    }

    function setCertificateNFT(address nft) external override {
        certificateNFT = ICertificateNFT(nft);
    }

    function setDisputeModule(address module) external override {
        disputeModule = IDisputeModule(module);
    }

    function setIdentityRegistry(address) external override {}

    function setAgentRootNode(bytes32) external override {}

    function setAgentMerkleRoot(bytes32) external override {}

    function setJobParameters(uint256, uint256 stake) external override {
        jobStake = stake;
    }

    function setJobStake(uint96 stake) external override {
        jobStake = stake;
    }

    function setMaxJobReward(uint256 maxReward) external override {
        maxJobReward = maxReward;
    }

    function setJobDurationLimit(uint256 limit) external override {
        maxJobDuration = limit;
    }

    function setFeePct(uint256 feePct_) external override {
        feePct = feePct_;
    }

    function setValidatorRewardPct(uint256 pct) external override {
        validatorRewardPct = pct;
    }

    function createJob(
        uint256 reward,
        uint64 deadline,
        string calldata uri
    ) external override returns (uint256 jobId) {
        require(
            taxAcknowledgedVersion[msg.sender] == taxPolicyVersion,
            "acknowledge tax policy"
        );
        if (address(taxPolicy) != address(0)) {
            require(
                taxPolicy.acknowledged(msg.sender),
                "acknowledge tax policy"
            );
        }
        require(reward <= maxJobReward, "reward");
        require(deadline > block.timestamp, "deadline");
        require(
            uint256(deadline) - block.timestamp <= maxJobDuration,
            "duration"
        );
        jobId = ++nextJobId;
        _jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: reward,
            stake: jobStake,
            success: false,
            status: Status.Created,
            uri: uri,
            result: ""
        });
        deadlines[jobId] = deadline;
        if (address(_stakeManager) != address(0) && reward > 0) {
            _stakeManager.lock(msg.sender, reward);
        }
        emit JobCreated(jobId, msg.sender, reward, deadline);
    }

    function applyForJob(
        uint256 jobId,
        string calldata,
        bytes32[] calldata
    ) public override {
        Job storage job = _jobs[jobId];
        require(job.status == Status.Created, "state");
        if (address(reputationEngine) != address(0)) {
            require(!reputationEngine.isBlacklisted(msg.sender), "blacklisted");
        }
        job.agent = msg.sender;
        job.status = Status.Applied;
        emit JobApplied(jobId, msg.sender);
    }

    function stakeAndApply(
        uint256 jobId,
        uint256,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external override {
        applyForJob(jobId, subdomain, proof);
    }

    function acknowledgeAndApply(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external override {
        applyForJob(jobId, subdomain, proof);
    }

    function submit(
        uint256 jobId,
        string calldata result,
        string calldata,
        bytes32[] calldata
    ) public override {
        Job storage job = _jobs[jobId];
        require(job.status == Status.Applied, "state");
        require(msg.sender == job.agent, "agent");
        require(block.timestamp <= deadlines[jobId], "deadline");
        job.result = result;
        job.status = Status.Submitted;
        emit JobSubmitted(jobId, msg.sender, result);
        if (address(validationModule) != address(0)) {
            validationModule.startValidation(jobId, result);
        }
    }

    function acknowledgeAndSubmit(
        uint256 jobId,
        string calldata result,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external override {
        submit(jobId, result, subdomain, proof);
    }

    function finalizeAfterValidation(uint256 jobId, bool success) public override {
        Job storage job = _jobs[jobId];
        require(job.status == Status.Submitted, "state");
        job.success = success;
        job.status = success ? Status.Completed : Status.Disputed;
        if (success) {
            finalize(jobId);
        } else {
            emit JobDisputed(jobId, msg.sender);
        }
    }

    function validationComplete(uint256 jobId, bool success) external override {
        finalizeAfterValidation(jobId, success);
    }

    function dispute(uint256 jobId, string calldata evidence) public override {
        Job storage job = _jobs[jobId];
        job.status = Status.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute(jobId, msg.sender);
        }
        emit JobDisputed(jobId, msg.sender);
    }

    /// @notice Backwards-compatible wrapper for legacy tests
    /// @dev Forwards to {dispute} with the provided evidence
    function raiseDispute(uint256 jobId, string calldata evidence) external {
        dispute(jobId, evidence);
    }

    function acknowledgeAndDispute(uint256 jobId, string calldata evidence)
        external
        override
    {
        dispute(jobId, evidence);
    }

    function resolveDispute(uint256 jobId, bool employerWins) external override {
        Job storage job = _jobs[jobId];
        require(job.status == Status.Disputed, "state");
        job.success = !employerWins;
        job.status = Status.Finalized;
        if (address(_stakeManager) != address(0) && job.reward > 0) {
            if (employerWins) {
                _stakeManager.release(job.employer, job.reward);
                if (address(reputationEngine) != address(0)) {
                    reputationEngine.subtract(job.agent, 1);
                }
            } else {
                _stakeManager.release(job.agent, job.reward);
                if (address(reputationEngine) != address(0)) {
                    reputationEngine.add(job.agent, 1);
                }
                if (address(certificateNFT) != address(0)) {
                    certificateNFT.mint(job.agent, jobId, job.uri);
                }
            }
        }
        emit DisputeResolved(jobId, employerWins);
        emit JobFinalized(jobId, job.agent);
    }

    function finalize(uint256 jobId) public override {
        Job storage job = _jobs[jobId];
        require(job.status == Status.Completed, "state");
        job.status = Status.Finalized;
        if (address(_stakeManager) != address(0) && job.reward > 0) {
            _stakeManager.release(job.agent, job.reward);
        }
        if (address(reputationEngine) != address(0)) {
            reputationEngine.add(job.agent, 1);
        }
        if (address(certificateNFT) != address(0)) {
            certificateNFT.mint(job.agent, jobId, job.uri);
        }
        emit JobFinalized(jobId, job.agent);
    }

    function acknowledgeAndFinalize(uint256 jobId) external override {
        finalize(jobId);
    }

    function cancelJob(uint256 jobId) public override {
        Job storage job = _jobs[jobId];
        require(job.status == Status.Created, "state");
        require(msg.sender == job.employer || msg.sender == owner(), "unauthorized");
        job.status = Status.Cancelled;
        if (address(_stakeManager) != address(0) && job.reward > 0) {
            _stakeManager.release(job.employer, job.reward);
        }
        emit JobCancelled(jobId);
    }

    function forceCancel(uint256 jobId) external override {
        cancelJob(jobId);
    }
}

contract MockReputationEngine is IReputationEngine {
    mapping(address => uint256) private _rep;
    mapping(address => bool) private _blacklist;
    uint256 public threshold;

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

    function reputationOf(address user) external view override returns (uint256) {
        return _rep[user];
    }

    function isBlacklisted(address user) external view override returns (bool) {
        return _blacklist[user];
    }

    function meetsThreshold(address user) external view override returns (bool) {
        return _rep[user] >= threshold;
    }

    function setCaller(address, bool) external override {}

    function setAuthorizedCaller(address, bool) external override {}

    function setThreshold(uint256 t) external override {
        threshold = t;
    }

    function setPremiumReputationThreshold(uint256 t) external override {
        threshold = t;
    }

    function setBlacklist(address user, bool val) external override {
        _blacklist[user] = val;
    }

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

    function rewardValidator(address user, uint256) external override {
        _rep[user] += 1;
    }

    function getOperatorScore(address user) external view override returns (uint256) {
        return _rep[user];
    }

    function setStakeManager(address) external override {}

    function setScoringWeights(uint256, uint256) external override {}
}
