// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";

/// @title ValidationModule
/// @notice Handles validator selection and commit–reveal validation for jobs.
contract ValidationModule is IValidationModule, Ownable {
    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;

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

    event ValidatorsUpdated(address[] validators);
    event ValidatorTiersUpdated(uint256[] payoutTiers, uint256[] counts);

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

    function selectValidators(uint256 jobId) external override returns (address[] memory) {
        Round storage r = rounds[jobId];
        require(r.validators.length == 0, "already selected");
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        uint256 count = _validatorCount(job.reward);
        require(validatorPool.length >= count, "insufficient validators");

        address[] memory pool = validatorPool;
        uint256 n = pool.length;
        // sort validators by stake descending
        for (uint256 i; i < n; i++) {
            for (uint256 j = i + 1; j < n; j++) {
                if (stakeManager.validatorStake(pool[j]) > stakeManager.validatorStake(pool[i])) {
                    (pool[i], pool[j]) = (pool[j], pool[i]);
                }
            }
        }

        address[] memory selected = new address[](count);
        for (uint256 i; i < count; i++) {
            selected[i] = pool[i];
            validatorStakes[jobId][pool[i]] = stakeManager.validatorStake(pool[i]);
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

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);

        success = r.approvals >= r.rejections;

        for (uint256 i; i < r.validators.length; i++) {
            address val = r.validators[i];
            uint256 stake = validatorStakes[jobId][val];
            uint256 slashAmount = (stake * validatorSlashingPercentage) / 100;
            if (!revealed[jobId][val] || votes[jobId][val] != success) {
                if (slashAmount > 0) {
                    stakeManager.slash(val, slashAmount, job.employer);
                }
            }
        }

        r.finalized = true;
        return success;
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

