// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJobRegistryKernel} from "./interfaces/IJobRegistryKernel.sol";
import {KernelConfig} from "./Config.sol";

/// @title ValidationModule
/// @notice Handles commit–reveal voting and enforces quorum thresholds.
contract ValidationModule is Ownable {
    KernelConfig public config;
    IJobRegistryKernel public jobRegistry;

    struct Round {
        address[] validators;
        uint64 commitDeadline;
        uint64 revealDeadline;
        bool configured;
        bool started;
        bool finalized;
        uint256 yesVotes;
        uint256 totalReveals;
        mapping(address => bytes32) commits;
        mapping(address => bool) revealed;
    }

    mapping(uint256 => Round) private rounds;

    event JobRegistryUpdated(address indexed jobRegistry);
    event ConfigUpdated(address indexed config);
    event RoundConfigured(uint256 indexed jobId, address[] validators);
    event RoundStarted(uint256 indexed jobId, uint64 commitDeadline, uint64 revealDeadline);
    event VoteCommitted(uint256 indexed jobId, address indexed validator, bytes32 commitment);
    event VoteRevealed(uint256 indexed jobId, address indexed validator, bool approve);
    event RoundFinalized(uint256 indexed jobId, bool approved, bool quorumMet);

    error ZeroAddress();
    error InvalidCaller();
    error InvalidValidators();
    error AlreadyConfigured();
    error NotConfigured();
    error AlreadyStarted();
    error NotStarted();
    error CommitClosed();
    error RevealClosed();
    error CommitMissing();
    error AlreadyRevealed();
    error RoundAlreadyFinalized();

    modifier onlyJobRegistry() {
        if (msg.sender != address(jobRegistry)) revert InvalidCaller();
        _;
    }

    constructor(KernelConfig config_, address owner_) Ownable(owner_) {
        if (address(config_) == address(0)) revert ZeroAddress();
        config = config_;
    }

    function setConfig(KernelConfig config_) external onlyOwner {
        if (address(config_) == address(0)) revert ZeroAddress();
        config = config_;
        emit ConfigUpdated(address(config_));
    }

    function setJobRegistry(IJobRegistryKernel registry) external onlyOwner {
        if (address(registry) == address(0)) revert ZeroAddress();
        jobRegistry = registry;
        emit JobRegistryUpdated(address(registry));
    }

    function configureRound(uint256 jobId, address[] calldata validators) external onlyJobRegistry {
        if (validators.length < config.minValidators()) revert InvalidValidators();
        Round storage round = rounds[jobId];
        if (round.configured) revert AlreadyConfigured();
        round.validators = validators;
        round.configured = true;
        emit RoundConfigured(jobId, validators);
    }

    function startRound(uint256 jobId) external onlyJobRegistry {
        Round storage round = rounds[jobId];
        if (!round.configured) revert NotConfigured();
        if (round.started) revert AlreadyStarted();
        uint256 commitWindow = config.commitWindow();
        uint256 revealWindow = config.revealWindow();
        round.started = true;
        round.commitDeadline = uint64(block.timestamp + commitWindow);
        round.revealDeadline = uint64(block.timestamp + commitWindow + revealWindow);
        emit RoundStarted(jobId, round.commitDeadline, round.revealDeadline);
    }

    function commit(uint256 jobId, bytes32 commitment) external {
        Round storage round = rounds[jobId];
        if (!round.started) revert NotStarted();
        if (block.timestamp > round.commitDeadline) revert CommitClosed();
        if (!_isValidator(round.validators, msg.sender)) revert InvalidCaller();
        if (round.commits[msg.sender] != bytes32(0)) revert AlreadyRevealed();
        if (commitment == bytes32(0)) revert CommitMissing();
        round.commits[msg.sender] = commitment;
        emit VoteCommitted(jobId, msg.sender, commitment);
    }

    function reveal(uint256 jobId, bool approve, bytes32 salt) external {
        Round storage round = rounds[jobId];
        if (!round.started) revert NotStarted();
        if (round.finalized) revert RoundAlreadyFinalized();
        if (block.timestamp <= round.commitDeadline) revert CommitClosed();
        if (block.timestamp > round.revealDeadline) revert RevealClosed();
        if (!_isValidator(round.validators, msg.sender)) revert InvalidCaller();
        bytes32 commitment = round.commits[msg.sender];
        if (commitment == bytes32(0)) revert CommitMissing();
        if (round.revealed[msg.sender]) revert AlreadyRevealed();
        bytes32 expected = keccak256(abi.encodePacked(jobId, msg.sender, approve, salt));
        if (expected != commitment) revert CommitMissing();
        round.revealed[msg.sender] = true;
        round.totalReveals += 1;
        if (approve) {
            round.yesVotes += 1;
        }
        emit VoteRevealed(jobId, msg.sender, approve);
    }

    function finalize(uint256 jobId) external {
        Round storage round = rounds[jobId];
        if (!round.started) revert NotStarted();
        if (round.finalized) revert RoundAlreadyFinalized();
        if (block.timestamp <= round.revealDeadline && round.totalReveals < round.validators.length) {
            revert RevealClosed();
        }
        round.finalized = true;

        address[] memory validators = round.validators;
        uint256 validatorCount = validators.length;
        address[] memory nonRevealers = new address[](validatorCount - round.totalReveals);
        address[] memory revealedValidators = new address[](round.totalReveals);
        uint256 nonRevealIdx;
        uint256 revealIdx;
        for (uint256 i = 0; i < validatorCount; i++) {
            address validator = validators[i];
            if (round.revealed[validator]) {
                revealedValidators[revealIdx++] = validator;
            } else {
                nonRevealers[nonRevealIdx++] = validator;
            }
        }

        bool quorumMet = round.totalReveals >= config.minValidators();
        bool approved;
        if (quorumMet) {
            uint256 yesBps = round.yesVotes * 10_000 / round.totalReveals;
            approved = yesBps >= config.approvalThresholdBps();
            if (approved) {
                jobRegistry.onValidationApproved(jobId, revealedValidators, nonRevealers);
            } else {
                jobRegistry.onValidationRejected(jobId, revealedValidators, nonRevealers);
            }
        } else {
            jobRegistry.onValidationQuorumFailure(jobId, nonRevealers);
        }

        emit RoundFinalized(jobId, approved, quorumMet);
    }

    function _isValidator(address[] memory validators, address account) private pure returns (bool) {
        for (uint256 i = 0; i < validators.length; i++) {
            if (validators[i] == account) return true;
        }
        return false;
    }
}
