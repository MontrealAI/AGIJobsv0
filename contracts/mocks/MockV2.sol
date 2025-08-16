// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../v2/interfaces/IStakeManager.sol";
import "../v2/interfaces/IJobRegistry.sol";
import "../v2/interfaces/IJobRegistryTax.sol";
import "../v2/interfaces/IReputationEngine.sol";
import "../v2/interfaces/IDisputeModule.sol";
import "../v2/interfaces/IValidationModule.sol";
import "../v2/interfaces/ICertificateNFT.sol";
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
    function lockJobFunds(bytes32, address, uint256) external override {}
    function lock(address, uint256) external override {}
    function releaseJobFunds(bytes32, address, uint256) external override {}
    function release(address, uint256) external override {}
    function finalizeJobFunds(bytes32, address, uint256, uint256, IFeePool) external override {}
    function setDisputeModule(address module) external override {
        disputeModule = module;
    }
    function lockDisputeFee(address, uint256) external override {}
    function payDisputeFee(address, uint256) external override {}

    function setSlashPercentSumEnforcement(bool) external override {}
    function setToken(IERC20) external override {}
    function setMinStake(uint256) external override {}
    function setSlashingPercentages(uint256, uint256) external override {}
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

    function stakeOf(address user, Role role) external view override returns (uint256) {
        return _stakes[user][role];
    }

    function totalStake(Role role) external view override returns (uint256) {
        return totalStakes[role];
    }

    function getHighestPayoutPercentage(address) external pure override returns (uint256) {
        return 100;
    }

    // legacy helper for tests
    function setTokenLegacy(address) external {}
}

contract MockJobRegistry is Ownable, IJobRegistry, IJobRegistryTax {
    constructor() Ownable(msg.sender) {}
    mapping(uint256 => Job) private _jobs;
    uint256 public taxPolicyVersion;
    mapping(address => uint256) public taxAcknowledgedVersion;

    IStakeManager private _stakeManager;
    IValidationModule public validationModule;
    IReputationEngine public reputationEngine;
    ICertificateNFT public certificateNFT;
    IDisputeModule public disputeModule;

    uint256 public jobStake;
    uint256 public maxJobReward;
    uint256 public jobDurationLimit;
    uint256 public nextJobId;
    mapping(uint256 => uint256) public deadlines;

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

    function setJobParameters(uint256, uint256 stake) external override {
        jobStake = stake;
    }

    function setMaxJobReward(uint256 maxReward) external override {
        maxJobReward = maxReward;
    }

    function setJobDurationLimit(uint256 limit) external override {
        jobDurationLimit = limit;
    }

    function createJob(uint256 reward, string calldata uri)
        external
        override
        returns (uint256 jobId)
    {
        require(reward <= maxJobReward, "reward");
        jobId = ++nextJobId;
        _jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: reward,
            stake: jobStake,
            success: false,
            status: Status.Created,
            uri: uri
        });
        deadlines[jobId] = block.timestamp + jobDurationLimit;
        if (address(_stakeManager) != address(0) && reward > 0) {
            _stakeManager.lock(msg.sender, reward);
        }
        emit JobCreated(jobId, msg.sender, address(0), reward, jobStake, 0);
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
        emit AgentApplied(jobId, msg.sender);
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

    function submit(uint256 jobId, string calldata uri) public override {
        Job storage job = _jobs[jobId];
        require(job.status == Status.Applied, "state");
        require(msg.sender == job.agent, "agent");
        job.uri = uri;
        job.status = Status.Submitted;
        emit JobSubmitted(jobId, uri);
        if (address(validationModule) != address(0)) {
            validationModule.selectValidators(jobId);
        }
    }

    function acknowledgeAndSubmit(uint256 jobId, string calldata uri)
        external
        override
    {
        submit(jobId, uri);
    }

    function finalizeAfterValidation(uint256 jobId, bool success) external override {
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

    function dispute(uint256 jobId, string calldata evidence) public override {
        Job storage job = _jobs[jobId];
        job.status = Status.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute(jobId, msg.sender, evidence);
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
        emit JobFinalized(jobId, job.success);
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
        emit JobFinalized(jobId, true);
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

    function isBlacklisted(address user) external view override returns (bool) {
        return _blacklist[user];
    }

    function canAccessPremium(address user) external view override returns (bool) {
        return _rep[user] >= threshold;
    }

    function setCaller(address, bool) external override {}

    function setThreshold(uint256 t) external override {
        threshold = t;
    }

    function setBlacklist(address user, bool val) external override {
        _blacklist[user] = val;
    }

    function getOperatorScore(address user) external view override returns (uint256) {
        return _rep[user];
    }

    function setStakeManager(address) external override {}

    function setScoringWeights(uint256, uint256) external override {}
}
