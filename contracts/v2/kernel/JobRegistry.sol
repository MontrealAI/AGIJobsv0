// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {KernelStakeManager} from "./StakeManager.sol";
import {EscrowVault} from "./EscrowVault.sol";
import {RewardEngine} from "./RewardEngine.sol";
import {KernelConfig} from "./Config.sol";
import {ValidationModule} from "./ValidationModule.sol";
import {IJobRegistryKernel} from "./interfaces/IJobRegistryKernel.sol";

/// @title KernelJobRegistry
/// @notice Coordinates job lifecycle, escrow, and validation outcomes.
contract KernelJobRegistry is Ownable, ReentrancyGuard, IJobRegistryKernel {
    struct Job {
        address employer;
        address agent;
        uint256 reward;
        uint64 deadline;
        uint64 submittedAt;
        bool submitted;
        bool finalized;
        bool success;
        bytes32 specHash;
    }

    uint256 public nextJobId = 1;
    address public opsTreasury;

    KernelStakeManager public stakeManager;
    EscrowVault public escrowVault;
    RewardEngine public rewardEngine;
    KernelConfig public config;
    ValidationModule public validationModule;

    mapping(uint256 => Job) public jobs;
    mapping(address => uint256) public activeJobs;
    mapping(uint256 => address[]) private jobValidators;

    event OpsTreasuryUpdated(address indexed treasury);
    event StakeManagerUpdated(address indexed manager);
    event EscrowVaultUpdated(address indexed vault);
    event RewardEngineUpdated(address indexed engine);
    event ValidationModuleUpdated(address indexed module);
    event ConfigUpdated(address indexed config);

    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint64 deadline,
        bytes32 specHash,
        address[] validators
    );
    event JobSubmitted(uint256 indexed jobId);
    event JobFinalized(uint256 indexed jobId, bool success);
    event JobCancelled(uint256 indexed jobId);

    event ParticipantSlashed(
        uint256 indexed jobId,
        address indexed offender,
        uint256 bps,
        string reason
    );

    error ZeroAddress();
    error InvalidReward();
    error InvalidDeadline();
    error InvalidCaller();
    error JobNotFound();
    error AlreadySubmitted();
    error AlreadyFinalized();
    error DeadlinePassed();
    error InsufficientStake();
    error ValidatorStakeTooLow(address validator);
    error TooManyJobs();
    error InvalidValidators();
    error NotEmployer();
    error NotExpired();

    modifier onlyValidationModule() {
        if (msg.sender != address(validationModule)) revert InvalidCaller();
        _;
    }

    constructor(
        KernelStakeManager stakeManager_,
        EscrowVault escrowVault_,
        RewardEngine rewardEngine_,
        KernelConfig config_,
        ValidationModule validationModule_,
        address owner_,
        address opsTreasury_
    ) Ownable(owner_) {
        if (
            address(stakeManager_) == address(0) ||
            address(escrowVault_) == address(0) ||
            address(rewardEngine_) == address(0) ||
            address(config_) == address(0)
        ) revert ZeroAddress();

        stakeManager = stakeManager_;
        escrowVault = escrowVault_;
        rewardEngine = rewardEngine_;
        config = config_;
        validationModule = validationModule_;
        opsTreasury = opsTreasury_;
    }

    // ---------------------------------------------------------------------
    // Governance setters
    // ---------------------------------------------------------------------

    function setStakeManager(KernelStakeManager manager) external onlyOwner {
        if (address(manager) == address(0)) revert ZeroAddress();
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
    }

    function setEscrowVault(EscrowVault vault) external onlyOwner {
        if (address(vault) == address(0)) revert ZeroAddress();
        escrowVault = vault;
        emit EscrowVaultUpdated(address(vault));
    }

    function setRewardEngine(RewardEngine engine) external onlyOwner {
        if (address(engine) == address(0)) revert ZeroAddress();
        rewardEngine = engine;
        emit RewardEngineUpdated(address(engine));
    }

    function setConfig(KernelConfig config_) external onlyOwner {
        if (address(config_) == address(0)) revert ZeroAddress();
        config = config_;
        emit ConfigUpdated(address(config_));
    }

    function setValidationModule(ValidationModule module) external onlyOwner {
        if (address(module) == address(0)) revert ZeroAddress();
        validationModule = module;
        emit ValidationModuleUpdated(address(module));
    }

    function setOpsTreasury(address treasury) external onlyOwner {
        opsTreasury = treasury;
        emit OpsTreasuryUpdated(treasury);
    }

    // ---------------------------------------------------------------------
    // Job lifecycle
    // ---------------------------------------------------------------------

    function createJob(
        address agent,
        address[] calldata validators,
        uint256 reward,
        uint64 deadline,
        bytes32 specHash
    ) external nonReentrant returns (uint256 jobId) {
        if (agent == address(0)) revert ZeroAddress();
        if (reward == 0) revert InvalidReward();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        uint256 maxDuration = config.maxJobDuration();
        if (deadline - block.timestamp > maxDuration) revert InvalidDeadline();
        if (stakeManager.availableStakeOf(agent) < config.minAgentStake()) revert InsufficientStake();
        if (validators.length < config.minValidators()) revert InvalidValidators();

        uint256 active = activeJobs[agent] + 1;
        uint256 limit = config.maxConcurrentJobsPerAgent();
        if (limit > 0 && active > limit) revert TooManyJobs();

        uint256 minValidatorStake = config.minValidatorStake();
        uint256 validatorCount = validators.length;
        for (uint256 i = 0; i < validatorCount; i++) {
            address validator = validators[i];
            if (validator == address(0)) revert InvalidValidators();
            if (stakeManager.availableStakeOf(validator) < minValidatorStake) {
                revert ValidatorStakeTooLow(validator);
            }
            for (uint256 j = 0; j < i; j++) {
                if (validators[j] == validator) revert InvalidValidators();
            }
        }

        jobId = nextJobId++;
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: agent,
            reward: reward,
            deadline: deadline,
            submittedAt: 0,
            submitted: false,
            finalized: false,
            success: false,
            specHash: specHash
        });
        activeJobs[agent] = active;

        uint256 validatorTotal = validators.length;
        address[] storage storedValidators = jobValidators[jobId];
        for (uint256 i = 0; i < validatorTotal; i++) {
            storedValidators.push(validators[i]);
        }

        stakeManager.lockStake(agent, jobId, config.minAgentStake());

        escrowVault.deposit(jobId, msg.sender, reward);
        validationModule.configureRound(jobId, validators);

        emit JobCreated(jobId, msg.sender, agent, reward, deadline, specHash, validators);
    }

    function submitResult(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.employer == address(0)) revert JobNotFound();
        if (job.finalized) revert AlreadyFinalized();
        if (msg.sender != job.agent) revert InvalidCaller();
        if (job.submitted) revert AlreadySubmitted();
        if (block.timestamp > job.deadline) revert DeadlinePassed();

        job.submitted = true;
        job.submittedAt = uint64(block.timestamp);
        _lockValidators(jobId);
        validationModule.startRound(jobId);
        emit JobSubmitted(jobId);
    }

    function cancelExpiredJob(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.employer == address(0)) revert JobNotFound();
        if (job.finalized) revert AlreadyFinalized();
        if (block.timestamp <= job.deadline) revert NotExpired();
        if (msg.sender != job.employer && msg.sender != owner()) revert InvalidCaller();

        job.finalized = true;
        if (activeJobs[job.agent] > 0) {
            activeJobs[job.agent] -= 1;
        }
        escrowVault.refund(jobId, job.employer);
        _slashParticipant(jobId, job.agent, config.maliciousSlashBps(), "ttl_expired");
        _unlockJob(jobId);
        emit JobCancelled(jobId);
    }

    // ---------------------------------------------------------------------
    // Validation callbacks
    // ---------------------------------------------------------------------

    function onValidationApproved(
        uint256 jobId,
        address[] calldata validators,
        address[] calldata nonRevealers
    ) external override onlyValidationModule nonReentrant {
        _handleNonRevealers(jobId, nonRevealers);
        _finalize(jobId, true, validators);
    }

    function onValidationRejected(
        uint256 jobId,
        address[] calldata validators,
        address[] calldata nonRevealers
    ) external override onlyValidationModule nonReentrant {
        _handleNonRevealers(jobId, nonRevealers);
        _slashParticipant(jobId, jobs[jobId].agent, config.maliciousSlashBps(), "validation_rejected");
        _finalize(jobId, false, validators);
    }

    function onValidationQuorumFailure(uint256 jobId, address[] calldata nonRevealers)
        external
        override
        onlyValidationModule
        nonReentrant
    {
        _handleNonRevealers(jobId, nonRevealers);
        _finalize(jobId, false, new address[](0));
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _handleNonRevealers(uint256 jobId, address[] calldata nonRevealers) internal {
        uint256 bps = config.noRevealSlashBps();
        if (bps == 0) return;
        for (uint256 i = 0; i < nonRevealers.length; i++) {
            _slashParticipant(jobId, nonRevealers[i], bps, "no_reveal");
        }
    }

    function _slashParticipant(uint256 jobId, address offender, uint256 bps, string memory reason) internal {
        if (offender == address(0) || bps == 0) return;
        address beneficiary = jobs[jobId].employer;
        if (stakeManager.stakeOf(offender) == 0) return;
        stakeManager.slash(offender, bps, beneficiary, reason);
        emit ParticipantSlashed(jobId, offender, bps, reason);
    }

    function _finalize(uint256 jobId, bool success, address[] memory rewardedValidators) internal {
        Job storage job = jobs[jobId];
        if (job.employer == address(0)) revert JobNotFound();
        if (job.finalized) revert AlreadyFinalized();
        job.finalized = true;
        job.success = success;
        if (activeJobs[job.agent] > 0) {
            activeJobs[job.agent] -= 1;
        }

        if (success) {
            RewardEngine.SplitResult memory split = rewardEngine.split(jobId, job.reward);

            if (split.agentAmount > 0) {
                escrowVault.release(jobId, job.agent, split.agentAmount);
            }

            uint256 validatorCount = rewardedValidators.length;
            if (split.validatorAmount > 0 && validatorCount > 0) {
                uint256 base = split.validatorAmount / validatorCount;
                uint256 remainder = split.validatorAmount - (base * validatorCount);
                for (uint256 i = 0; i < validatorCount; i++) {
                    uint256 payout = base;
                    if (i == 0) payout += remainder;
                    escrowVault.release(jobId, rewardedValidators[i], payout);
                }
            }

            if (split.opsAmount > 0 && opsTreasury != address(0)) {
                escrowVault.release(jobId, opsTreasury, split.opsAmount);
            }

            if (split.employerRebateAmount > 0) {
                escrowVault.release(jobId, job.employer, split.employerRebateAmount);
            }

            if (split.burnAmount > 0) {
                escrowVault.burn(jobId, split.burnAmount);
            }

            uint256 remaining = escrowVault.balanceOf(jobId);
            if (remaining > 0) {
                escrowVault.refund(jobId, job.employer);
            }
        } else {
            escrowVault.refund(jobId, job.employer);
        }

        _unlockJob(jobId);
        emit JobFinalized(jobId, success);
    }

    function _lockValidators(uint256 jobId) internal {
        address[] storage validators = jobValidators[jobId];
        uint256 minStake = config.minValidatorStake();
        for (uint256 i = 0; i < validators.length; i++) {
            stakeManager.lockStake(validators[i], jobId, minStake);
        }
    }

    function _unlockJob(uint256 jobId) internal {
        Job storage job = jobs[jobId];
        stakeManager.unlockAll(job.agent, jobId);

        address[] storage validators = jobValidators[jobId];
        for (uint256 i = 0; i < validators.length; i++) {
            stakeManager.unlockAll(validators[i], jobId);
        }

        delete jobValidators[jobId];
    }
}
