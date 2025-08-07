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
    uint256 public validatorsPerJob;

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

    event ValidatorsUpdated(address[] validators);

    constructor(IJobRegistry _jobRegistry, IStakeManager _stakeManager, address owner)
        Ownable(owner)
    {
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
    }

    /// @notice Update list of validators eligible for selection.
    function setValidatorPool(address[] calldata validators) external onlyOwner {
        validatorPool = validators;
        emit ValidatorsUpdated(validators);
    }

    function selectValidators(uint256 jobId) external override returns (address[] memory) {
        Round storage r = rounds[jobId];
        require(r.validators.length == 0, "already selected");
        require(validatorPool.length >= validatorsPerJob, "insufficient validators");

        address[] memory pool = validatorPool;
        address[] memory selected = new address[](validatorsPerJob);
        uint256 rand = uint256(keccak256(abi.encode(block.prevrandao, jobId)));
        uint256 n = pool.length;

        for (uint256 i; i < validatorsPerJob; i++) {
            rand = uint256(keccak256(abi.encode(rand, i)));
            uint256 idx = rand % n;
            selected[i] = pool[idx];
            pool[idx] = pool[n - 1];
            n--;
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

        revealed[jobId][msg.sender] = true;
        votes[jobId][msg.sender] = approve;
        if (approve) r.approvals++; else r.rejections++;

        emit ValidationRevealed(jobId, msg.sender, approve);
    }

    function finalize(uint256 jobId) external override returns (bool success) {
        Round storage r = rounds[jobId];
        require(!r.finalized, "finalized");
        require(block.timestamp > r.revealDeadline, "reveal pending");

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);

        for (uint256 i; i < r.validators.length; i++) {
            address val = r.validators[i];
            if (!revealed[jobId][val]) {
                uint256 stake = stakeManager.validatorStake(val);
                uint256 slashAmount = (stake * validatorSlashingPercentage) / 100;
                if (slashAmount > 0) {
                    stakeManager.slash(val, slashAmount, job.employer);
                }
            }
        }

        success = r.approvals >= r.rejections;
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

    function _isValidator(uint256 jobId, address val) internal view returns (bool) {
        address[] storage list = rounds[jobId].validators;
        for (uint256 i; i < list.length; i++) {
            if (list[i] == val) return true;
        }
        return false;
    }
}

