// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";

/// @title ValidationModule
/// @notice Handles validator selection and commit–reveal validation for jobs.
contract ValidationModule is IValidationModule, Ownable {
    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IDisputeModule public disputeModule;

    // configuration
    uint256 public validatorStakeRequirement;
    uint256 public validatorStakePercentage;
    uint256 public validatorRewardPercentage;
    uint256 public validatorSlashingPercentage;
    uint256 public commitDuration;
    uint256 public revealDuration;
    uint256 public reviewWindow;
    uint256 public resolveGracePeriod;
    uint256 public validatorsPerJob; // default fallback

    // payout-based validator count tiers
    uint256[] public payoutTiers;
    uint256[] public tierValidatorCounts;

    // pool of available validators
    address[] public validatorPool;

    // additional entropy for validator selection
    bytes32 public validatorSelectionSeed;

    struct Round {
        address[] validators;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 approvals;
        uint256 rejections;
        bool finalized;
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => bytes32)) public commitments;
    mapping(uint256 => mapping(address => bool)) public revealed;
    mapping(uint256 => mapping(address => bool)) public votes;
    mapping(uint256 => mapping(address => uint256)) public validatorStakes;
    mapping(uint256 => bool) public appealed;

    event ValidatorsUpdated(address[] validators);
    event ValidatorTiersUpdated(uint256[] payoutTiers, uint256[] counts);
    event ReputationEngineUpdated(address engine);
    event DisputeModuleUpdated(address module);
    event ValidatorSelectionSeedUpdated(bytes32 newSeed);

    constructor(IJobRegistry _jobRegistry, IStakeManager _stakeManager, address owner)
        Ownable(owner)
    {
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        validatorStakePercentage = 10;
        validatorSlashingPercentage = 50;
    }

    /// @notice Update list of validators eligible for selection.
    function setValidatorPool(address[] calldata validators) external onlyOwner {
        validatorPool = validators;
        emit ValidatorsUpdated(validators);
    }

    /// @notice Update the reputation engine used for validator feedback.
    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    /// @notice Update the dispute module used for appeals.
    function setDisputeModule(IDisputeModule module) external onlyOwner {
        disputeModule = module;
        emit DisputeModuleUpdated(address(module));
    }

    /// @notice Update the entropy seed used in validator selection.
    function setValidatorSelectionSeed(bytes32 seed) external onlyOwner {
        validatorSelectionSeed = seed;
        emit ValidatorSelectionSeedUpdated(seed);
    }

    function selectValidators(uint256 jobId) external override returns (address[] memory) {
        Round storage r = rounds[jobId];
        require(r.validators.length == 0, "already selected");
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        uint256 count = _validatorCount(job.reward);

        address[] memory pool = validatorPool;
        uint256 n = pool.length;
        uint256[] memory stakes = new uint256[](n);
        uint256 totalStake;
        uint256 m;

        for (uint256 i; i < n; ++i) {
            uint256 stake = stakeManager.stakeOf(pool[i], IStakeManager.Role.Validator);
            bool allowed = stake >= validatorStakeRequirement;
            if (allowed && address(reputationEngine) != address(0)) {
                allowed = !reputationEngine.isBlacklisted(pool[i]);
            }
            if (allowed) {
                stakes[m] = stake;
                pool[m] = pool[i];
                totalStake += stake;
                m++;
            }
        }

        require(m >= count, "insufficient validators");

        bytes32 seed = keccak256(
            abi.encodePacked(
                blockhash(block.number - 1),
                jobId,
                validatorSelectionSeed
            )
        );

        address[] memory selected = new address[](count);
        uint256 remaining = m;
        for (uint256 i; i < count; ++i) {
            seed = keccak256(abi.encodePacked(seed, i));
            uint256 rnum = uint256(seed) % totalStake;
            uint256 cumulative;
            uint256 idx;
            for (uint256 j; j < remaining; ++j) {
                cumulative += stakes[j];
                if (rnum < cumulative) {
                    idx = j;
                    break;
                }
            }
            address val = pool[idx];
            selected[i] = val;
            validatorStakes[jobId][val] = stakes[idx];

            totalStake -= stakes[idx];
            pool[idx] = pool[remaining - 1];
            stakes[idx] = stakes[remaining - 1];
            remaining--;
        }

        r.validators = selected;
        r.commitDeadline = block.timestamp + commitDuration;
        r.revealDeadline = r.commitDeadline + revealDuration;

        emit ValidatorsSelected(jobId, selected);
        return selected;
    }

    function commitValidation(uint256 jobId, bytes32 commitHash) external override {
        Round storage r = rounds[jobId];
        require(block.timestamp <= r.commitDeadline && r.commitDeadline != 0, "commit closed");
        require(_isValidator(jobId, msg.sender), "not validator");
        require(commitments[jobId][msg.sender] == bytes32(0), "already committed");

        commitments[jobId][msg.sender] = commitHash;
        emit ValidationCommitted(jobId, msg.sender, commitHash);
    }

    function revealValidation(uint256 jobId, bool approve, bytes32 salt) external override {
        Round storage r = rounds[jobId];
        require(block.timestamp > r.commitDeadline, "commit phase");
        require(block.timestamp <= r.revealDeadline, "reveal closed");
        bytes32 commitHash = commitments[jobId][msg.sender];
        require(commitHash != bytes32(0), "no commit");
        require(!revealed[jobId][msg.sender], "already revealed");
        require(keccak256(abi.encode(approve, salt)) == commitHash, "invalid reveal");

        uint256 stake = validatorStakes[jobId][msg.sender];
        require(stake > 0, "stake");
        revealed[jobId][msg.sender] = true;
        votes[jobId][msg.sender] = approve;
        if (approve) r.approvals += stake; else r.rejections += stake;

        emit ValidationRevealed(jobId, msg.sender, approve);
    }

    function finalize(uint256 jobId) external override returns (bool success) {
        Round storage r = rounds[jobId];
        require(!r.finalized, "finalized");
        require(block.timestamp > r.revealDeadline, "reveal pending");
        if (resolveGracePeriod != 0) {
            require(
                block.timestamp <= r.revealDeadline + resolveGracePeriod,
                "grace passed"
            );
        }

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);

        success = r.approvals >= r.rejections;

        for (uint256 i; i < r.validators.length; i++) {
            address val = r.validators[i];
            uint256 stake = validatorStakes[jobId][val];
            uint256 slashAmount = (stake * validatorSlashingPercentage) / 100;
            if (!revealed[jobId][val] || votes[jobId][val] != success) {
                if (slashAmount > 0) {
                    stakeManager.slash(
                        val,
                        IStakeManager.Role.Validator,
                        slashAmount,
                        job.employer
                    );
                }
                if (address(reputationEngine) != address(0)) {
                    reputationEngine.subtractReputation(val, 1);
                }
            } else if (address(reputationEngine) != address(0)) {
                reputationEngine.addReputation(val, 1);
            }
        }

        r.finalized = true;
        return success;
    }

    function appeal(uint256 jobId) external payable override {
        Round storage r = rounds[jobId];
        require(r.finalized, "not finalized");
        require(!appealed[jobId], "appealed");
        require(
            reviewWindow == 0 ||
                block.timestamp <= r.revealDeadline + reviewWindow,
            "window closed"
        );
        appealed[jobId] = true;
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute{value: msg.value}(jobId);
        } else {
            require(msg.value == 0, "fee unused");
        }
        emit ValidationAppealed(jobId, msg.sender);
    }

    function setParameters(
        uint256 _validatorStakeRequirement,
        uint256 _validatorStakePercentage,
        uint256 _validatorRewardPercentage,
        uint256 _validatorSlashingPercentage,
        uint256 _commitDuration,
        uint256 _revealDuration,
        uint256 _reviewWindow,
        uint256 _resolveGracePeriod,
        uint256 _validatorsPerJob
    ) external override onlyOwner {
        validatorStakeRequirement = _validatorStakeRequirement;
        validatorStakePercentage = _validatorStakePercentage;
        validatorRewardPercentage = _validatorRewardPercentage;
        validatorSlashingPercentage = _validatorSlashingPercentage;
        commitDuration = _commitDuration;
        revealDuration = _revealDuration;
        reviewWindow = _reviewWindow;
        resolveGracePeriod = _resolveGracePeriod;
        validatorsPerJob = _validatorsPerJob;
        emit ParametersUpdated();
    }

    function setValidatorTiers(
        uint256[] calldata _payoutTiers,
        uint256[] calldata _counts
    ) external onlyOwner {
        require(_payoutTiers.length == _counts.length, "length");
        payoutTiers = _payoutTiers;
        tierValidatorCounts = _counts;
        emit ValidatorTiersUpdated(_payoutTiers, _counts);
    }

    function _validatorCount(uint256 payout) internal view returns (uint256 count) {
        count = validatorsPerJob;
        for (uint256 i; i < payoutTiers.length; i++) {
            if (payout >= payoutTiers[i]) {
                count = tierValidatorCounts[i];
            } else {
                break;
            }
        }
    }

    function _isValidator(uint256 jobId, address val) internal view returns (bool) {
        address[] storage list = rounds[jobId].validators;
        for (uint256 i; i < list.length; i++) {
            if (list[i] == val) return true;
        }
        return false;
    }
}

