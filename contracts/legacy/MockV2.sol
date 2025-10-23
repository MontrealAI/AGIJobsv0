// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

import "../v2/interfaces/IStakeManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../v2/interfaces/IJobRegistry.sol";
import "../v2/interfaces/IJobRegistryTax.sol";
import "../v2/interfaces/IReputationEngine.sol";
import "../v2/interfaces/IDisputeModule.sol";
import "../v2/interfaces/IValidationModule.sol";
import "../v2/interfaces/ICertificateNFT.sol";
import "../v2/interfaces/ITaxPolicy.sol";
import "../v2/interfaces/IDomainRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockStakeManager is IStakeManager {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    mapping(address => mapping(Role => uint256)) private _stakes;
    mapping(Role => uint256) public totalStakes;
    address public disputeModule;
    address public override jobRegistry;
    uint256 public burnPctValue;
    uint256 public validatorSlashRewardPctValue;

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
    function setValidatorLockManager(address, bool) external override {}
    function lockValidatorStake(uint256, address, uint256, uint64) external override {}
    function lockReward(bytes32, address, uint256) external override {}
    function lock(address, uint256) external override {}
    function releaseReward(bytes32, address, address, uint256, bool) external override {}
    function refundEscrow(bytes32, address, uint256) external override {}
    function redistributeEscrow(bytes32, address, uint256) external override {}
    function redistributeEscrow(bytes32, address, uint256, address[] calldata) external override {}
    function releaseStake(address, uint256) external override {}
    function unlockValidatorStake(uint256, address, uint256) external override {}
    function release(address, address, uint256, bool) external override {}
    function finalizeJobFunds(
        bytes32,
        address,
        address,
        uint256,
        uint256,
        uint256,
        IFeePool,
        bool
    ) external override {}
    function finalizeJobFundsWithPct(
        bytes32,
        address,
        address,
        uint256,
        uint256,
        uint256,
        uint256,
        IFeePool,
        bool
    ) external override {}
    function distributeValidatorRewards(bytes32, uint256) external override {}
    function fundOperatorRewardPool(uint256) external override {}
    function withdrawOperatorRewardPool(address, uint256) external override {}
    function setDisputeModule(address module) external override {
        disputeModule = module;
    }
    function setValidationModule(address) external override {}
    function setModules(address, address) external override {}
    function lockDisputeFee(address, uint256) external override {}
    function payDisputeFee(address, uint256) external override {}

    function setMinStake(uint256) external override {}
    function setRoleMinimums(uint256, uint256, uint256) external override {}
    function setRoleMinimum(Role, uint256) external override {}
    function setSlashPercents(uint16, uint16, uint16, uint16, uint16) external override {}
    function setSlashingPercentages(uint256, uint256) external override {}
    function setSlashingParameters(uint256, uint256) external override {}
    function setTreasury(address) external override {}
    function setTreasuryAllowlist(address, bool) external override {}
    function setMaxStakePerAddress(uint256) external override {}
    function setMaxAGITypes(uint256) external override {}
    function setFeePct(uint256) external override {}
    function setFeePool(IFeePool) external override {}
    function setBurnPct(uint256 pct) external override {
        burnPctValue = pct;
    }
    function setValidatorRewardPct(uint256) external override {}
    function setValidatorSlashRewardPct(uint256 pct) external override {
        validatorSlashRewardPctValue = pct;
    }
    function setSlashingDistribution(uint256, uint256, uint256 pct) external override {
        validatorSlashRewardPctValue = pct;
    }
    function setOperatorSlashPct(uint256) external override {}
    function setSlashDistribution(uint256, uint256, uint256, uint256 pct) external override {
        validatorSlashRewardPctValue = pct;
    }
    function validatorSlashRewardPct() external view override returns (uint256) {
        return validatorSlashRewardPctValue;
    }
    function autoTuneStakes(bool) external override {}
    function configureAutoStake(
        uint256,
        uint256,
        uint256,
        uint256,
        uint256,
        uint256,
        int256,
        int256,
        uint256,
        uint256,
        uint256
    ) external override {}
    function setThermostat(address) external override {}
    function setHamiltonianFeed(address) external override {}
    function recordDispute() external override {}
    function checkpointStake() external override {}
    function addAGIType(address, uint256) external override {}
    function removeAGIType(address) external override {}
    function syncBoostedStake(address, Role) external override {}

    function slash(address user, Role role, uint256 amount, address)
        external
        override
    {
        uint256 st = _stakes[user][role];
        require(st >= amount, "stake");
        _stakes[user][role] = st - amount;
        totalStakes[role] -= amount;
    }

    function slash(
        address user,
        Role role,
        uint256 amount,
        address,
        address[] calldata
    ) external override {
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

    function governanceSlash(
        address user,
        Role role,
        uint256 pctBps,
        address
    ) external override returns (uint256 amount) {
        uint256 stake = _stakes[user][role];
        amount = (stake * pctBps) / 10_000;
        if (amount > stake) {
            amount = stake;
        }
        _stakes[user][role] = stake - amount;
        totalStakes[role] -= amount;
        return amount;
    }

    function slash(
        address user,
        uint256 amount,
        address,
        address[] calldata
    ) external override {
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

    function totalBoostedStake(Role role) external view override returns (uint256) {
        return totalStakes[role];
    }

    function roleMinimumStake(Role) external pure override returns (uint256) {
        return 0;
    }

    function getTotalPayoutPct(address) external pure override returns (uint256) {
        return 100;
    }

    function burnPct() external view override returns (uint256) {
        return burnPctValue;
    }

    function token() external pure override returns (IERC20) {
        return IERC20(address(0));
    }

    function operatorRewardPool() external pure override returns (uint256) {
        return 0;
    }

    function maxTotalPayoutPct() external pure override returns (uint256) {
        return 100;
    }

    function setMaxTotalPayoutPct(uint256) external override {}

    // legacy helper for tests
}

contract MockJobRegistry is Ownable, IJobRegistry, IJobRegistryTax {
    uint256 public constant version = 2;

    uint256 private constant _STATUS_OFFSET = 0;
    uint256 private constant _SUCCESS_OFFSET = 3;
    uint256 private constant _BURN_CONFIRMED_OFFSET = 4;
    uint256 private constant _AGENT_TYPES_OFFSET = 5;
    uint256 private constant _FEE_PCT_OFFSET = 13;
    uint256 private constant _AGENT_PCT_OFFSET = 45;
    uint256 private constant _DEADLINE_OFFSET = 77;
    uint256 private constant _ASSIGNED_AT_OFFSET = 141;

    uint256 private constant _STATUS_MASK = 0x7 << _STATUS_OFFSET;
    uint256 private constant _SUCCESS_MASK = 1 << _SUCCESS_OFFSET;
    uint256 private constant _BURN_CONFIRMED_MASK = 1 << _BURN_CONFIRMED_OFFSET;
    uint256 private constant _AGENT_TYPES_MASK = uint256(0xFF) << _AGENT_TYPES_OFFSET;
    uint256 private constant _FEE_PCT_MASK = uint256(type(uint32).max) << _FEE_PCT_OFFSET;
    uint256 private constant _AGENT_PCT_MASK = uint256(type(uint32).max) << _AGENT_PCT_OFFSET;
    uint256 private constant _DEADLINE_MASK = uint256(type(uint64).max) << _DEADLINE_OFFSET;
    uint256 private constant _ASSIGNED_AT_MASK = uint256(type(uint64).max) << _ASSIGNED_AT_OFFSET;

    constructor() Ownable(msg.sender) {}
    mapping(uint256 => Job) private _jobs;
    uint256 public taxPolicyVersion;
    mapping(address => uint256) public taxAcknowledgedVersion;

    ITaxPolicy public taxPolicy;

    IStakeManager private _stakeManager;
    address public validationModule;
    IReputationEngine public reputationEngine;
    ICertificateNFT public certificateNFT;
    IDisputeModule public disputeModule;
    IDomainRegistry public domainRegistry;

    uint256 public jobStake;
    uint256 public maxJobReward;
    uint256 public maxJobDuration;
    uint256 public minAgentStake;
    uint256 public feePct;
    uint256 public validatorRewardPct;
    uint256 public nextJobId;
    mapping(uint256 => uint256) public deadlines;
    mapping(uint256 => mapping(bytes32 => bool)) public burnReceiptMap;
    mapping(uint256 => bool) public reputationProcessed;
    mapping(uint256 => uint256) private _jobDomains;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        uint256 reward,
        uint256 deadline
    );

    struct LegacyJob {
        address employer;
        address agent;
        uint256 reward;
        uint256 stake;
        bool success;
        Status status;
        bytes32 uriHash;
        bytes32 resultHash;
    }

    function _encodeMetadata(JobMetadata memory metadata)
        internal
        pure
        returns (uint256)
    {
        return
            (uint256(uint8(metadata.status)) << _STATUS_OFFSET) |
            (metadata.success ? (1 << _SUCCESS_OFFSET) : 0) |
            (metadata.burnConfirmed ? (1 << _BURN_CONFIRMED_OFFSET) : 0) |
            (uint256(metadata.agentTypes) << _AGENT_TYPES_OFFSET) |
            (uint256(metadata.feePct) << _FEE_PCT_OFFSET) |
            (uint256(metadata.agentPct) << _AGENT_PCT_OFFSET) |
            (uint256(metadata.deadline) << _DEADLINE_OFFSET) |
            (uint256(metadata.assignedAt) << _ASSIGNED_AT_OFFSET);
    }

    function _getMetadata(Job storage job)
        internal
        view
        returns (JobMetadata memory)
    {
        return decodeJobMetadata(job.packedMetadata);
    }

    function _setMetadata(Job storage job, JobMetadata memory metadata)
        internal
    {
        job.packedMetadata = _encodeMetadata(metadata);
    }

    function _getStatus(Job storage job) internal view returns (Status) {
        return Status(uint8((job.packedMetadata & _STATUS_MASK) >> _STATUS_OFFSET));
    }

    function _setStatus(Job storage job, Status status) internal {
        JobMetadata memory metadata = _getMetadata(job);
        metadata.status = status;
        _setMetadata(job, metadata);
    }

    function _getSuccess(Job storage job) internal view returns (bool) {
        return (job.packedMetadata & _SUCCESS_MASK) != 0;
    }

    function _setSuccess(Job storage job, bool success) internal {
        JobMetadata memory metadata = _getMetadata(job);
        metadata.success = success;
        _setMetadata(job, metadata);
    }

    function _setBurnConfirmed(Job storage job, bool burnConfirmed) internal {
        JobMetadata memory metadata = _getMetadata(job);
        metadata.burnConfirmed = burnConfirmed;
        _setMetadata(job, metadata);
    }

    function _setAssignedAt(Job storage job, uint64 assignedAt) internal {
        JobMetadata memory metadata = _getMetadata(job);
        metadata.assignedAt = assignedAt;
        _setMetadata(job, metadata);
    }

    function decodeJobMetadata(uint256 packed)
        public
        pure
        override
        returns (JobMetadata memory metadata)
    {
        metadata.status = Status(uint8((packed & _STATUS_MASK) >> _STATUS_OFFSET));
        metadata.success = (packed & _SUCCESS_MASK) != 0;
        metadata.burnConfirmed = (packed & _BURN_CONFIRMED_MASK) != 0;
        metadata.agentTypes = uint8((packed & _AGENT_TYPES_MASK) >> _AGENT_TYPES_OFFSET);
        metadata.feePct = uint32((packed & _FEE_PCT_MASK) >> _FEE_PCT_OFFSET);
        metadata.agentPct = uint32((packed & _AGENT_PCT_MASK) >> _AGENT_PCT_OFFSET);
        metadata.deadline = uint64((packed & _DEADLINE_MASK) >> _DEADLINE_OFFSET);
        metadata.assignedAt = uint64((packed & _ASSIGNED_AT_MASK) >> _ASSIGNED_AT_OFFSET);
    }

    function setJob(uint256 jobId, LegacyJob calldata job) external {
        JobMetadata memory metadata = JobMetadata({
            status: job.status,
            success: job.success,
            burnConfirmed: false,
            agentTypes: 0,
            feePct: uint32(feePct),
            agentPct: 0,
            deadline: 0,
            assignedAt: 0
        });
        _jobs[jobId] = Job({
            employer: job.employer,
            agent: job.agent,
            reward: uint128(job.reward),
            stake: uint96(job.stake),
            burnReceiptAmount: 0,
            uriHash: job.uriHash,
            resultHash: job.resultHash,
            specHash: bytes32(0),
            packedMetadata: _encodeMetadata(metadata)
        });
    }

    function jobs(uint256 jobId) external view override returns (Job memory) {
        return _jobs[jobId];
    }

    function getSpecHash(uint256 jobId) external view override returns (bytes32) {
        return _jobs[jobId].specHash;
    }

    function getJobValidators(uint256)
        external
        pure
        override
        returns (address[] memory validators)
    {
        validators = new address[](0);
    }

    function getJobValidatorVote(uint256, address)
        external
        pure
        override
        returns (bool)
    {
        return false;
    }

    function validatorCommittee(uint256)
        external
        pure
        override
        returns (address[] memory validators, bool[] memory approvals)
    {
        validators = new address[](0);
        approvals = new bool[](0);
    }

    function submitBurnReceipt(
        uint256 jobId,
        bytes32 burnTxHash,
        uint256,
        uint256
    ) external override {
        burnReceiptMap[jobId][burnTxHash] = true;
        emit BurnReceiptSubmitted(jobId, burnTxHash, 0, 0);
    }

    function hasBurnReceipt(uint256 jobId, bytes32 burnTxHash)
        external
        view
        override
        returns (bool)
    {
        return burnReceiptMap[jobId][burnTxHash];
    }

    function burnEvidenceStatus(uint256 jobId)
        external
        view
        override
        returns (bool burnRequired, bool burnSatisfied)
    {
        burnRequired =
            address(_stakeManager) != address(0) &&
            _stakeManager.burnPct() > 0;
        if (!burnRequired) {
            return (false, true);
        }
        burnSatisfied =
            (decodeJobMetadata(_jobs[jobId].packedMetadata).burnConfirmed);
    }

    function acknowledgeTaxPolicy() public {
        if (address(taxPolicy) != address(0)) {
            taxPolicy.acknowledge();
        }
        taxAcknowledgedVersion[msg.sender] = taxPolicyVersion;
    }

    function setTaxPolicy(address policy) external {
        taxPolicy = ITaxPolicy(policy);
    }

    function setTaxPolicyVersion(uint256 _version) external {
        taxPolicyVersion = _version;
    }

    function setValidationModule(address module) external override {
        validationModule = module;
    }

    function setReputationEngine(address engine) external override {
        reputationEngine = IReputationEngine(engine);
    }

    function markReputationProcessed(uint256 jobId) external override {
        reputationProcessed[jobId] = true;
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

    function setDomainRegistry(IDomainRegistry registry) external override {
        domainRegistry = registry;
    }

    function setIdentityRegistry(address) external override {}

    function setAgentRootNode(bytes32) external override {}

    function setAgentMerkleRoot(bytes32) external override {}

    function setJobParameters(uint256 maxReward, uint256 stake) external override {
        maxJobReward = maxReward;
        jobStake = stake;
    }

    function setJobStake(uint96 stake) external override {
        jobStake = stake;
    }

    function setMinAgentStake(uint256 stake) external override {
        minAgentStake = stake;
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

    function _createJobInternal(
        address employer,
        uint256 reward,
        uint64 deadline,
        bytes32 specHash,
        string calldata uri,
        uint8 agentTypes
    ) internal returns (uint256 jobId) {
        require(
            taxAcknowledgedVersion[employer] == taxPolicyVersion,
            "acknowledge tax policy"
        );
        if (address(taxPolicy) != address(0)) {
            require(
                taxPolicy.hasAcknowledged(employer),
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
        bytes32 uriHash = keccak256(bytes(uri));
        JobMetadata memory metadata = JobMetadata({
            status: Status.Created,
            success: false,
            burnConfirmed: false,
            agentTypes: agentTypes,
            feePct: uint32(feePct),
            agentPct: 0,
            deadline: deadline,
            assignedAt: 0
        });
        _jobs[jobId] = Job({
            employer: employer,
            agent: address(0),
            reward: uint128(reward),
            stake: uint96(jobStake),
            burnReceiptAmount: 0,
            uriHash: uriHash,
            resultHash: bytes32(0),
            specHash: specHash,
            packedMetadata: _encodeMetadata(metadata)
        });
        deadlines[jobId] = deadline;
        if (address(_stakeManager) != address(0) && reward > 0) {
            _stakeManager.lock(employer, reward);
        }
        emit JobCreated(jobId, employer, reward, deadline);
    }

    function createJob(
        uint256 reward,
        uint64 deadline,
        bytes32 specHash,
        string calldata uri
    ) external override returns (uint256 jobId) {
        return
            _createJobInternal(
                msg.sender,
                reward,
                deadline,
                specHash,
                uri,
                0
            );
    }

    function createDomainJob(
        uint256 reward,
        uint64 deadline,
        bytes32 specHash,
        string calldata uri,
        uint256 domainId
    ) public override returns (uint256 jobId) {
        jobId = _createJobInternal(
            msg.sender,
            reward,
            deadline,
            specHash,
            uri,
            0
        );
        _jobDomains[jobId] = domainId;
    }

    function createDomainJobWithAgentTypes(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        bytes32 specHash,
        string calldata uri,
        uint256 domainId
    ) public override returns (uint256 jobId) {
        jobId = _createJobInternal(
            msg.sender,
            reward,
            deadline,
            specHash,
            uri,
            agentTypes
        );
        _jobDomains[jobId] = domainId;
    }

    function acknowledgeAndCreateDomainJob(
        uint256 reward,
        uint64 deadline,
        bytes32 specHash,
        string calldata uri,
        uint256 domainId
    ) external override returns (uint256 jobId) {
        acknowledgeTaxPolicy();
        return createDomainJob(reward, deadline, specHash, uri, domainId);
    }

    function acknowledgeAndCreateDomainJobWithAgentTypes(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        bytes32 specHash,
        string calldata uri,
        uint256 domainId
    ) external override returns (uint256 jobId) {
        acknowledgeTaxPolicy();
        return
            createDomainJobWithAgentTypes(
                reward,
                deadline,
                agentTypes,
                specHash,
                uri,
                domainId
            );
    }

    function overrideJobDomain(uint256 jobId, uint256 domainId) external override {
        _jobDomains[jobId] = domainId;
    }

    function jobDomain(uint256 jobId) external view override returns (uint256) {
        return _jobDomains[jobId];
    }

    function jobDomainDetails(uint256 jobId)
        external
        view
        override
        returns (IDomainRegistry.DomainView memory)
    {
        uint256 domainId = _jobDomains[jobId];
        require(address(domainRegistry) != address(0), "domain registry");
        require(domainId != 0, "domain not set");
        return domainRegistry.getDomain(domainId);
    }

    function applyForJob(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata
    ) public override {
        Job storage job = _jobs[jobId];
        require(_getStatus(job) == Status.Created, "state");
        if (address(reputationEngine) != address(0)) {
            require(!reputationEngine.isBlacklisted(msg.sender), "blacklisted");
        }
        job.agent = msg.sender;
        _setStatus(job, Status.Applied);
        _setAssignedAt(job, uint64(block.timestamp));
        emit ApplicationSubmitted(jobId, msg.sender, subdomain);
        emit AgentAssigned(jobId, msg.sender, subdomain);
        emit JobApplied(jobId, msg.sender, subdomain);
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
        bytes32 resultHash,
        string calldata resultURI,
        string calldata subdomain,
        bytes32[] calldata
    ) public override {
        Job storage job = _jobs[jobId];
        require(_getStatus(job) == Status.Applied, "state");
        require(msg.sender == job.agent, "agent");
        require(block.timestamp <= deadlines[jobId], "deadline");
        job.resultHash = resultHash;
        _setStatus(job, Status.Submitted);
        emit ResultSubmitted(jobId, msg.sender, resultHash, resultURI, subdomain);
        emit JobSubmitted(jobId, msg.sender, resultHash, resultURI, subdomain);
        if (validationModule != address(0)) {
            IValidationModule(validationModule).start(jobId, 0);
        }
    }

    function acknowledgeAndSubmit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external override {
        submit(jobId, resultHash, resultURI, subdomain, proof);
    }

    function finalizeAfterValidation(uint256 jobId, bool success) public override {
        Job storage job = _jobs[jobId];
        require(_getStatus(job) == Status.Submitted, "state");
        _setSuccess(job, success);
        _setStatus(job, success ? Status.Completed : Status.Disputed);
        if (!success) {
            emit JobDisputed(jobId, msg.sender);
        }
    }

    function validationComplete(uint256 jobId, bool success) external override {
        finalizeAfterValidation(jobId, success);
    }

    function onValidationResult(
        uint256 jobId,
        bool success,
        address[] calldata /*validators*/
    ) external override {
        finalizeAfterValidation(jobId, success);
    }

    function forceFinalize(uint256 jobId) external override {
        Job storage job = _jobs[jobId];
        require(_getStatus(job) == Status.Submitted, "state");
        _setSuccess(job, false);
        _setStatus(job, Status.Completed);
    }

    function dispute(
        uint256 jobId,
        bytes32 evidenceHash,
        string calldata reason
    ) public override {
        _dispute(jobId, evidenceHash, reason);
    }

    /// @notice Backwards-compatible wrapper for legacy tests
    /// @dev Forwards to {dispute} with the provided evidence hash
    function raiseDispute(uint256 jobId, bytes32 evidenceHash) external {
        _dispute(jobId, evidenceHash, "");
    }

    function raiseDispute(uint256 jobId, string calldata reason) external {
        _dispute(jobId, bytes32(0), reason);
    }

    function escalateToDispute(uint256 jobId, string calldata reason) external override {
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseGovernanceDispute(jobId, reason);
        }
        _dispute(jobId, bytes32(0), reason);
    }

    function acknowledgeAndDispute(
        uint256 jobId,
        bytes32 evidenceHash,
        string calldata reason
    ) external override {
        _dispute(jobId, evidenceHash, reason);
    }

    function acknowledgeAndDispute(uint256 jobId, bytes32 evidenceHash)
        external
        override
    {
        _dispute(jobId, evidenceHash, "");
    }

    function _dispute(
        uint256 jobId,
        bytes32 evidenceHash,
        string memory reason
    ) internal {
        require(
            evidenceHash != bytes32(0) || bytes(reason).length != 0,
            "evidence"
        );
        Job storage job = _jobs[jobId];
        _setStatus(job, Status.Disputed);
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute(jobId, msg.sender, evidenceHash, reason);
        }
        emit JobDisputed(jobId, msg.sender);
    }

    function resolveDispute(uint256 jobId, bool employerWins) external override {
        Job storage job = _jobs[jobId];
        require(_getStatus(job) == Status.Disputed, "state");
        _setSuccess(job, !employerWins);
        _setStatus(job, Status.Completed);
        emit DisputeResolved(jobId, employerWins);
    }

    function finalize(uint256 jobId) public override {
        Job storage job = _jobs[jobId];
        require(_getStatus(job) == Status.Completed, "state");
        _setStatus(job, Status.Finalized);
        bool success = _getSuccess(job);
        if (address(_stakeManager) != address(0) && job.reward > 0) {
            address recipient = success ? job.agent : job.employer;
            _stakeManager.release(job.employer, recipient, job.reward, success);
            if (!success) {
                _stakeManager.slash(job.agent, IStakeManager.Role.Agent, job.stake, recipient);
            }
        }
        if (address(reputationEngine) != address(0)) {
            if (success) {
                reputationEngine.add(job.agent, 1);
            } else {
                reputationEngine.subtract(job.agent, 1);
            }
        }
        if (success && address(certificateNFT) != address(0)) {
            certificateNFT.mint(job.agent, jobId, job.uriHash);
        }
        emit JobFinalized(jobId, job.agent);
    }

    function acknowledgeAndFinalize(uint256 jobId) external override {
        finalize(jobId);
    }

    function cancelJob(uint256 jobId) public override {
        Job storage job = _jobs[jobId];
        require(_getStatus(job) == Status.Created, "state");
        require(msg.sender == job.employer || msg.sender == owner(), "unauthorized");
        _setStatus(job, Status.Cancelled);
        if (address(_stakeManager) != address(0) && job.reward > 0) {
            _stakeManager.release(job.employer, job.employer, job.reward, false);
        }
        emit JobCancelled(jobId);
    }

    function forceCancel(uint256 jobId) external override {
        cancelJob(jobId);
    }

    function confirmEmployerBurn(uint256 jobId, bytes32) external override {
        _setBurnConfirmed(_jobs[jobId], true);
    }

    function setBurnConfirmed(uint256 jobId, bool confirmed) external {
        _setBurnConfirmed(_jobs[jobId], confirmed);
    }

    function getEmployerReputation(address)
        external
        pure
        override
        returns (uint256 successful, uint256 failed)
    {
        return (0, 0);
    }

    function getEmployerScore(address) external pure virtual override returns (uint256) {
        return 1e18;
    }
}

contract MockReputationEngine is IReputationEngine {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    mapping(address => uint256) private _rep;
    mapping(address => uint256) private _entropy;
    mapping(address => bool) private _blacklist;
    uint256 public threshold;

    function add(address user, uint256 amount) external override {
        _rep[user] += amount;
    }

    function subtract(address user, uint256 amount) external override {
        uint256 rep = _rep[user];
        _rep[user] = rep > amount ? rep - amount : 0;
        _entropy[user] += amount;
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

    function entropy(address user) external view override returns (uint256) {
        return _entropy[user];
    }

    function getEntropy(address user) external view override returns (uint256) {
        return _entropy[user];
    }

    function entropyOf(address user) external view override returns (uint256) {
        return _entropy[user];
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

    function setPremiumThreshold(uint256 t) external override {
        threshold = t;
    }

    function setBlacklist(address user, bool val) external override {
        _blacklist[user] = val;
    }

    function onApply(address user) external view override {
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

    function updateScores(
        uint256,
        address agent,
        address[] calldata validators,
        bool success,
        bool[] calldata validatorRevealed,
        bool[] calldata validatorVotes,
        uint256,
        uint256
    ) external override {
        if (success) {
            _rep[agent] += 1;
        } else if (_rep[agent] < threshold) {
            _blacklist[agent] = true;
        }
        uint256 length = validators.length;
        for (uint256 i; i < length;) {
            address validator = validators[i];
            if (!validatorRevealed[i] || validatorVotes[i] != success) {
                uint256 rep = _rep[validator];
                _rep[validator] = rep > 0 ? rep - 1 : 0;
            } else if (success) {
                _rep[validator] += 1;
            }
            unchecked {
                ++i;
            }
        }
    }

    function calculateReputationPoints(uint256, uint256)
        external
        pure
        override
        returns (uint256)
    {
        return 0;
    }

    function getOperatorScore(address user) external view override returns (uint256) {
        return _rep[user];
    }

    function setStakeManager(address) external override {}

    function setScoringWeights(uint256, uint256) external override {}
}
