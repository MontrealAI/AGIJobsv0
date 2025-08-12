// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IJobRegistryTax} from "./interfaces/IJobRegistryTax.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IVRF} from "./interfaces/IVRF.sol";

/// @title ValidationModule
/// @notice Handles validator selection and commit–reveal voting for jobs.
/// @dev Holds no ether and keeps the owner and contract tax neutral; only
///      participating validators and job parties bear tax obligations.
contract ValidationModule is IValidationModule, Ownable {
    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;

    // timing configuration
    uint256 public commitWindow;
    uint256 public revealWindow;

    // validator bounds per job
    uint256 public minValidators;
    uint256 public maxValidators;

    // slashing percentage applied to validator stake for incorrect votes
    uint256 public validatorSlashingPercentage = 50;

    // pool of validators
    address[] public validatorPool;
    // optional VRF provider for future randomness upgrades
    IVRF public vrf;

    struct Round {
        address[] validators;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 approvals;
        uint256 rejections;
        bool tallied;
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => mapping(uint256 => bytes32))) public commitments;
    mapping(uint256 => mapping(address => bool)) public revealed;
    mapping(uint256 => mapping(address => bool)) public votes;
    mapping(uint256 => mapping(address => uint256)) public validatorStakes;
    mapping(uint256 => uint256) public jobNonce;

    event ValidatorsUpdated(address[] validators);
    event ReputationEngineUpdated(address engine);
    event VRFUpdated(address vrf);
    event TimingUpdated(uint256 commitWindow, uint256 revealWindow);
    event ValidatorBoundsUpdated(uint256 minValidators, uint256 maxValidators);
    event JobNonceReset(uint256 indexed jobId);

    /// @notice Require caller to acknowledge current tax policy via JobRegistry.
    modifier requiresTaxAcknowledgement() {
        if (msg.sender != owner()) {
            address registry = address(jobRegistry);
            require(registry != address(0), "job registry");
            IJobRegistryTax j = IJobRegistryTax(registry);
            require(
                j.taxAcknowledgedVersion(msg.sender) == j.taxPolicyVersion(),
                "acknowledge tax policy"
            );
        }
        _;
    }

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        uint256 _commitWindow,
        uint256 _revealWindow,
        uint256 _minValidators,
        uint256 _maxValidators,
        address[] memory _validatorPool
    ) Ownable(msg.sender) {
        require(_commitWindow > 0 && _revealWindow > 0, "windows");
        require(_minValidators > 0 && _maxValidators >= _minValidators, "bounds");
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        commitWindow = _commitWindow;
        revealWindow = _revealWindow;
        minValidators = _minValidators;
        maxValidators = _maxValidators;
        if (_validatorPool.length != 0) {
            validatorPool = _validatorPool;
            emit ValidatorsUpdated(_validatorPool);
        }
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

    /// @notice Set the optional VRF provider for future upgrades.
    function setVRF(IVRF provider) external onlyOwner {
        vrf = provider;
        emit VRFUpdated(address(provider));
    }

    /// @notice Update the commit and reveal windows.
    function setCommitRevealWindows(uint256 commitDur, uint256 revealDur)
        external
        override
        onlyOwner
    {
        require(commitDur > 0 && revealDur > 0, "windows");
        commitWindow = commitDur;
        revealWindow = revealDur;
        emit TimingUpdated(commitDur, revealDur);
    }

    /// @notice Set minimum and maximum validators per round.
    function setValidatorBounds(uint256 minVals, uint256 maxVals) external override onlyOwner {
        require(minVals > 0 && maxVals >= minVals, "bounds");
        minValidators = minVals;
        maxValidators = maxVals;
        emit ValidatorBoundsUpdated(minVals, maxVals);
    }

    /// @inheritdoc IValidationModule
    function selectValidators(uint256 jobId) external override returns (address[] memory selected) {
        Round storage r = rounds[jobId];
        require(r.validators.length == 0, "already selected");
        jobNonce[jobId] += 1;

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

        require(m >= minValidators, "insufficient validators");
        uint256 count = m < maxValidators ? m : maxValidators;

        bytes32 seed = keccak256(
            abi.encodePacked(blockhash(block.number - 1), jobId, block.timestamp)
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

    /// @notice Commit a validation hash for a job.
    function commitValidation(uint256 jobId, bytes32 commitHash)
        public
        override
        requiresTaxAcknowledgement
    {
        Round storage r = rounds[jobId];
        require(
            r.commitDeadline != 0 && block.timestamp <= r.commitDeadline,
            "commit closed"
        );
        require(_isValidator(jobId, msg.sender), "not validator");
        require(validatorStakes[jobId][msg.sender] > 0, "stake");
        uint256 nonce = jobNonce[jobId];
        require(
            commitments[jobId][msg.sender][nonce] == bytes32(0),
            "already committed"
        );

        commitments[jobId][msg.sender][nonce] = commitHash;
        emit VoteCommitted(jobId, msg.sender, commitHash);
    }

    /// @notice Reveal a previously committed validation vote.
    function revealValidation(uint256 jobId, bool approve, bytes32 salt)
        public
        override
        requiresTaxAcknowledgement
    {
        Round storage r = rounds[jobId];
        require(block.timestamp > r.commitDeadline, "commit phase");
        require(block.timestamp <= r.revealDeadline, "reveal closed");
        uint256 nonce = jobNonce[jobId];
        bytes32 commitHash = commitments[jobId][msg.sender][nonce];
        require(commitHash != bytes32(0), "no commit");
        require(!revealed[jobId][msg.sender], "already revealed");
        require(
            keccak256(abi.encodePacked(jobId, nonce, approve, salt)) == commitHash,
            "invalid reveal"
        );

        uint256 stake = validatorStakes[jobId][msg.sender];
        require(stake > 0, "stake");
        revealed[jobId][msg.sender] = true;
        votes[jobId][msg.sender] = approve;
        if (approve) r.approvals += stake; else r.rejections += stake;

        emit VoteRevealed(jobId, msg.sender, approve);
    }

    /// @notice Backwards-compatible wrapper for commitValidation.
    function commitVote(uint256 jobId, bytes32 commitHash)
        external
        requiresTaxAcknowledgement
    {
        commitValidation(jobId, commitHash);
    }

    /// @notice Backwards-compatible wrapper for revealValidation.
    function revealVote(uint256 jobId, bool approve, bytes32 salt)
        external
        requiresTaxAcknowledgement
    {
        revealValidation(jobId, approve, salt);
    }

    /// @notice Tally revealed votes and apply slashing/rewards.
    function tally(uint256 jobId) external override returns (bool success) {
        Round storage r = rounds[jobId];
        require(!r.tallied, "tallied");
        require(block.timestamp > r.revealDeadline, "reveal pending");

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

    /// @notice Reset the validation nonce for a job after finalization or dispute resolution.
    /// @param jobId Identifier of the job
    function resetJobNonce(uint256 jobId) external override {
        require(
            msg.sender == owner() || msg.sender == address(jobRegistry),
            "not authorized"
        );
        uint256 nonce = jobNonce[jobId];
        address[] storage vals = rounds[jobId].validators;
        for (uint256 i; i < vals.length; ++i) {
            address val = vals[i];
            delete commitments[jobId][val][nonce];
            delete revealed[jobId][val];
            delete votes[jobId][val];
            delete validatorStakes[jobId][val];
        }
        delete rounds[jobId];
        delete jobNonce[jobId];
        emit JobNonceReset(jobId);
    }

    function _isValidator(uint256 jobId, address val) internal view returns (bool) {
        address[] storage list = rounds[jobId].validators;
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == val) return true;
        }
        return false;
    }

    /// @notice Confirms the contract and its owner can never accrue tax obligations.
    /// @return Always true to signal perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Prevent accidental ETH deposits; the module never holds funds.
    receive() external payable {
        revert("ValidationModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("ValidationModule: no ether");
    }
}

