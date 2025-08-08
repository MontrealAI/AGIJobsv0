// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";

/// @title ValidationModule
/// @notice Handles validator selection and commit–reveal voting for jobs.
contract ValidationModule is IValidationModule, Ownable {
    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;

    // timing configuration
    uint256 public commitWindow;
    uint256 public revealWindow;

    // payout thresholds and validator counts per tier
    uint256[] public rewardTiers;
    uint256[] public validatorsPerTier;

    // slashing percentage applied to validator stake for incorrect votes
    uint256 public validatorSlashingPercentage = 50;

    // pool of validators and entropy seed for selection
    address[] public validatorPool;
    bytes32 public validatorSelectionSeed;

    struct Round {
        address[] validators;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 approvals;
        uint256 rejections;
        bool tallied;
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => bytes32)) public commitments;
    mapping(uint256 => mapping(address => bool)) public revealed;
    mapping(uint256 => mapping(address => bool)) public votes;
    mapping(uint256 => mapping(address => uint256)) public validatorStakes;

    event ValidatorsUpdated(address[] validators);
    event ReputationEngineUpdated(address engine);
    event ValidatorSelectionSeedUpdated(bytes32 newSeed);

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        address owner
    ) Ownable(owner) {
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
    }

    /// @notice Update the list of eligible validators.
    function setValidatorPool(address[] calldata validators) external onlyOwner {
        validatorPool = validators;
        emit ValidatorsUpdated(validators);
    }

    /// @notice Update the reputation engine used for validator feedback.
    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    /// @notice Update the entropy seed used in validator selection.
    function setValidatorSelectionSeed(bytes32 seed) external onlyOwner {
        validatorSelectionSeed = seed;
        emit ValidatorSelectionSeedUpdated(seed);
    }

    /// @inheritdoc IValidationModule
    function selectValidators(uint256 jobId)
        external
        override
        returns (address[] memory selected)
    {
        Round storage r = rounds[jobId];
        if (r.validators.length != 0) revert AlreadySelected();

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        uint256 count = _validatorCount(job.reward);
        if (count == 0) revert InsufficientValidators();

        address[] memory pool = validatorPool;
        uint256 n = pool.length;
        uint256[] memory stakes = new uint256[](n);
        uint256 totalStake;
        uint256 m;

        for (uint256 i; i < n; ++i) {
            uint256 stake = stakeManager.stakeOf(pool[i], IStakeManager.Role.Validator);
            if (address(reputationEngine) != address(0)) {
                if (reputationEngine.isBlacklisted(pool[i])) continue;
            }
            if (stake > 0) {
                stakes[m] = stake;
                pool[m] = pool[i];
                totalStake += stake;
                m++;
            }
        }
        if (m < count) revert InsufficientValidators();

        bytes32 seed = keccak256(
            abi.encodePacked(blockhash(block.number - 1), jobId, validatorSelectionSeed)
        );

        selected = new address[](count);
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
        r.commitDeadline = block.timestamp + commitWindow;
        r.revealDeadline = r.commitDeadline + revealWindow;

        emit ValidatorsSelected(jobId, selected);
        return selected;
    }

    /// @inheritdoc IValidationModule
    function commitVote(uint256 jobId, bytes32 commitHash) external override {
        Round storage r = rounds[jobId];
        if (r.commitDeadline == 0 || block.timestamp > r.commitDeadline) revert CommitPhaseClosed();
        if (!_isValidator(jobId, msg.sender)) revert NotValidator();
        if (commitments[jobId][msg.sender] != bytes32(0)) revert AlreadyCommitted();

        commitments[jobId][msg.sender] = commitHash;
        emit VoteCommitted(jobId, msg.sender, commitHash);
    }

    /// @inheritdoc IValidationModule
    function revealVote(uint256 jobId, bool approve, bytes32 salt) external override {
        Round storage r = rounds[jobId];
        if (block.timestamp <= r.commitDeadline) revert CommitPhaseOpen();
        if (block.timestamp > r.revealDeadline) revert RevealPhaseClosed();
        bytes32 commitHash = commitments[jobId][msg.sender];
        if (commitHash == bytes32(0)) revert NoCommit();
        if (revealed[jobId][msg.sender]) revert AlreadyRevealed();
        if (keccak256(abi.encode(approve, salt)) != commitHash) revert InvalidReveal();

        uint256 stake = validatorStakes[jobId][msg.sender];
        if (stake == 0) revert NoStake();
        revealed[jobId][msg.sender] = true;
        votes[jobId][msg.sender] = approve;
        if (approve) r.approvals += stake; else r.rejections += stake;

        emit VoteRevealed(jobId, msg.sender, approve);
    }

    /// @inheritdoc IValidationModule
    function tally(uint256 jobId) external override returns (bool success) {
        Round storage r = rounds[jobId];
        if (r.tallied) revert AlreadyTallied();
        if (block.timestamp <= r.revealDeadline) revert RevealPending();

        success = r.approvals >= r.rejections;
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);

        for (uint256 i; i < r.validators.length; ++i) {
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
                    reputationEngine.subtract(val, 1);
                }
            } else if (address(reputationEngine) != address(0)) {
                reputationEngine.add(val, 1);
            }
        }

        r.tallied = true;
        return success;
    }

    /// @inheritdoc IValidationModule
    function setParameters(
        uint256 _commitWindow,
        uint256 _revealWindow,
        uint256[] calldata _rewardTiers,
        uint256[] calldata _validatorsPerTier
    ) external override onlyOwner {
        if (_rewardTiers.length != _validatorsPerTier.length) revert LengthMismatch();
        commitWindow = _commitWindow;
        revealWindow = _revealWindow;

        delete rewardTiers;
        delete validatorsPerTier;
        for (uint256 i; i < _rewardTiers.length; ++i) {
            rewardTiers.push(_rewardTiers[i]);
            validatorsPerTier.push(_validatorsPerTier[i]);
        }

        emit ParametersUpdated();
    }

    function _validatorCount(uint256 reward) internal view returns (uint256 count) {
        uint256 len = rewardTiers.length;
        for (uint256 i; i < len; ++i) {
            if (reward < rewardTiers[i]) {
                return validatorsPerTier[i];
            }
        }
        return len == 0 ? 0 : validatorsPerTier[len - 1];
    }

    function _isValidator(uint256 jobId, address val) internal view returns (bool) {
        address[] storage list = rounds[jobId].validators;
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == val) return true;
        }
        return false;
    }
}

