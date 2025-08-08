// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IReputationEngine} from "../interfaces/IReputationEngine.sol";

/// @title ValidationModule
/// @notice Basic validator selection and commit–reveal voting for job validation.
contract ValidationModule is IValidationModule, Ownable {
    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;

    uint256 public commitWindow;
    uint256 public revealWindow;
    uint256 public validatorStake;
    uint256 public committeeSize;

    address[] public validatorPool;
    bytes32 public validatorSeed;

    struct Round {
        address[] validators;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 approvals;
        uint256 rejections;
        bool finalized;
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => bytes32)) public commits;
    mapping(uint256 => mapping(address => bool)) public revealed;
    mapping(uint256 => mapping(address => bool)) public votes;

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        IReputationEngine _reputationEngine,
        address owner
    ) Ownable(owner) {
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        reputationEngine = _reputationEngine;
    }

    /// @notice Update the pool of eligible validators.
    function setValidatorPool(address[] calldata validators) external onlyOwner {
        validatorPool = validators;
    }

    /// @notice Update seed used for validator selection.
    function setValidatorSeed(bytes32 seed) external onlyOwner {
        validatorSeed = seed;
    }

    /// @inheritdoc IValidationModule
    function selectValidators(uint256 jobId)
        external
        override
        returns (address[] memory selected)
    {
        Round storage r = rounds[jobId];
        require(r.validators.length == 0, "selected");

        uint256 n = validatorPool.length;
        require(committeeSize > 0 && n >= committeeSize, "pool");

        // filter pool for stake and reputation
        address[] memory pool = new address[](n);
        uint256 m;
        for (uint256 i; i < n; i++) {
            address val = validatorPool[i];
            if (
                stakeManager.stakeOf(val, IStakeManager.Role.Validator) >=
                validatorStake
            ) {
                if (
                    address(reputationEngine) == address(0) ||
                    !reputationEngine.isBlacklisted(val)
                ) {
                    pool[m++] = val;
                }
            }
        }
        require(m >= committeeSize, "insufficient");

        bytes32 rand = keccak256(
            abi.encodePacked(blockhash(block.number - 1), validatorSeed, jobId)
        );
        selected = new address[](committeeSize);
        for (uint256 i; i < committeeSize; i++) {
            rand = keccak256(abi.encodePacked(rand, i));
            uint256 idx = uint256(rand) % m;
            address val = pool[idx];
            selected[i] = val;
            stakeManager.lockStake(
                val,
                IStakeManager.Role.Validator,
                validatorStake
            );
            pool[idx] = pool[m - 1];
            m--;
        }

        r.validators = selected;
        r.commitDeadline = block.timestamp + commitWindow;
        r.revealDeadline = r.commitDeadline + revealWindow;
        emit ValidatorsSelected(jobId, selected);
    }

    /// @inheritdoc IValidationModule
    function commitValidation(uint256 jobId, bytes32 commitHash) external override {
        Round storage r = rounds[jobId];
        require(r.commitDeadline != 0 && block.timestamp <= r.commitDeadline, "commit");
        require(_isValidator(jobId, msg.sender), "not validator");
        require(commits[jobId][msg.sender] == bytes32(0), "committed");

        commits[jobId][msg.sender] = commitHash;
        emit ValidationCommitted(jobId, msg.sender, commitHash);
    }

    /// @inheritdoc IValidationModule
    function revealValidation(uint256 jobId, bool approve, bytes32 salt)
        external
        override
    {
        Round storage r = rounds[jobId];
        require(block.timestamp > r.commitDeadline, "commit phase");
        require(block.timestamp <= r.revealDeadline, "reveal");
        bytes32 hash = commits[jobId][msg.sender];
        require(hash != bytes32(0), "no commit");
        require(!revealed[jobId][msg.sender], "revealed");
        require(keccak256(abi.encode(approve, salt)) == hash, "mismatch");

        revealed[jobId][msg.sender] = true;
        votes[jobId][msg.sender] = approve;
        if (approve) r.approvals++; else r.rejections++;
        emit ValidationRevealed(jobId, msg.sender, approve);
    }

    /// @inheritdoc IValidationModule
    function finalize(uint256 jobId) external override returns (bool success) {
        Round storage r = rounds[jobId];
        require(!r.finalized, "finalized");
        require(block.timestamp > r.revealDeadline, "pending");

        success = r.approvals >= r.rejections;
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        for (uint256 i; i < r.validators.length; i++) {
            address val = r.validators[i];
            if (!revealed[jobId][val] || votes[jobId][val] != success) {
                stakeManager.slash(
                    val,
                    IStakeManager.Role.Validator,
                    validatorStake,
                    job.employer
                );
                if (address(reputationEngine) != address(0)) {
                    reputationEngine.subtractReputation(val, 1);
                }
            } else if (address(reputationEngine) != address(0)) {
                reputationEngine.addReputation(val, 1);
            }
        }
        r.finalized = true;
    }

    /// @inheritdoc IValidationModule
    function appeal(uint256 jobId) external payable override {
        emit ValidationAppealed(jobId, msg.sender);
    }

    /// @inheritdoc IValidationModule
    function setParameters(
        uint256 _validatorStakeRequirement,
        uint256 /* _validatorStakePercentage */,
        uint256 /* _validatorRewardPercentage */,
        uint256 /* _validatorSlashingPercentage */,
        uint256 _commitDuration,
        uint256 _revealDuration,
        uint256 /* _reviewWindow */,
        uint256 /* _resolveGracePeriod */,
        uint256 _validatorsPerJob
    ) external override onlyOwner {
        validatorStake = _validatorStakeRequirement;
        commitWindow = _commitDuration;
        revealWindow = _revealDuration;
        committeeSize = _validatorsPerJob;
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

