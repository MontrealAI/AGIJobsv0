// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IStakeManager {
    function slash(address user, uint256 amount, address recipient) external;
}

/// @title SelfPlayArena
/// @notice Coordinates self-play training rounds between teachers, students and validators.
contract SelfPlayArena is Ownable, Pausable, ReentrancyGuard {
    /// @notice Thrown when caller is neither the owner nor the orchestrator.
    error Unauthorized();

    /// @notice Thrown when a zero address is supplied where not allowed.
    error InvalidAddress();

    /// @notice Thrown when an invalid job identifier is supplied.
    error InvalidJobId();

    /// @notice Thrown when attempting to access a round that does not exist.
    error RoundNotFound(uint256 roundId);

    /// @notice Thrown when attempting to mutate a round that has already been closed.
    error RoundAlreadyClosed(uint256 roundId);

    /// @notice Thrown when attempting to finalize a round that has not been closed yet.
    error RoundNotClosed(uint256 roundId);

    /// @notice Thrown when attempting to finalize a round that is already finalized.
    error RoundAlreadyFinalized(uint256 roundId);

    /// @notice Thrown when attempting to interact with a round that has been aborted.
    error RoundIsAborted(uint256 roundId);

    /// @notice Thrown when attempting to register the same participant twice.
    error DuplicateParticipant(address participant);

    /// @notice Thrown when a difficulty delta would underflow or overflow the difficulty scale.
    error InvalidDifficultyDelta();

    /// @notice Thrown when attempting to slash with an invalid amount.
    error InvalidSlashAmount();

    /// @notice Thrown when a slashing operation is requested but no StakeManager is configured.
    error StakeManagerNotSet();

    struct Round {
        uint256 teacherJobId;
        uint32 difficulty;
        int32 difficultyDelta;
        uint64 startedAt;
        uint64 closedAt;
        uint64 finalizedAt;
        uint64 abortedAt;
        bool closed;
        bool finalized;
        bool aborted;
        address teacher;
        uint256[] studentJobIds;
        address[] students;
        uint256[] validatorJobIds;
        address[] validators;
    }

    struct RoundView {
        uint256 id;
        uint256 teacherJobId;
        uint32 difficulty;
        int32 difficultyDelta;
        uint64 startedAt;
        uint64 closedAt;
        uint64 finalizedAt;
        uint64 abortedAt;
        bool closed;
        bool finalized;
        bool aborted;
        address teacher;
        uint256[] studentJobIds;
        address[] students;
        uint256[] validatorJobIds;
        address[] validators;
    }

    /// @notice Latest round identifier.
    uint256 private _roundIdTracker;

    /// @notice Round storage by identifier.
    mapping(uint256 => Round) private _rounds;

    /// @notice Address permitted to orchestrate round lifecycle actions alongside the owner.
    address public orchestrator;

    /// @notice External StakeManager contract providing staking and slashing capabilities.
    IStakeManager public stakeManager;

    event OrchestratorUpdated(address indexed previous, address indexed current);
    event StakeManagerUpdated(address indexed previous, address indexed current);
    event RoundStarted(
        uint256 indexed roundId,
        uint256 indexed teacherJobId,
        address indexed teacher,
        uint32 difficulty,
        uint64 startedAt
    );
    event StudentRegistered(uint256 indexed roundId, uint256 jobId, address indexed student);
    event ValidatorRegistered(uint256 indexed roundId, uint256 jobId, address indexed validator);
    event RoundClosed(uint256 indexed roundId, uint64 closedAt);
    event RoundFinalized(
        uint256 indexed roundId,
        uint32 previousDifficulty,
        int32 difficultyDelta,
        uint32 newDifficulty,
        uint64 finalizedAt
    );
    event RoundAborted(uint256 indexed roundId, uint64 abortedAt);
    event ValidatorSlashed(
        uint256 indexed roundId, address indexed validator, uint256 amount, address indexed recipient
    );

    modifier onlyOwnerOrchestrator() {
        if (msg.sender != owner() && msg.sender != orchestrator) {
            revert Unauthorized();
        }
        _;
    }

    constructor(address owner_, address orchestrator_, address stakeManager_) Ownable(owner_) {
        orchestrator = orchestrator_;
        stakeManager = IStakeManager(stakeManager_);

        emit OrchestratorUpdated(address(0), orchestrator_);
        emit StakeManagerUpdated(address(0), stakeManager_);
    }

    /// @notice Updates the orchestrator account.
    function setOrchestrator(address newOrchestrator) external onlyOwner {
        address previous = orchestrator;
        orchestrator = newOrchestrator;
        emit OrchestratorUpdated(previous, newOrchestrator);
    }

    /// @notice Updates the StakeManager integration contract.
    function setStakeManager(address newStakeManager) external onlyOwner {
        address previous = address(stakeManager);
        stakeManager = IStakeManager(newStakeManager);
        emit StakeManagerUpdated(previous, newStakeManager);
    }

    /// @notice Pauses the contract, disabling state changing operations.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses the contract, allowing state changing operations.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Starts a new self-play round.
    function startRound(uint256 teacherJobId, address teacher, uint32 difficulty)
        external
        whenNotPaused
        onlyOwnerOrchestrator
        returns (uint256 roundId)
    {
        if (teacherJobId == 0) revert InvalidJobId();
        if (teacher == address(0)) revert InvalidAddress();

        roundId = ++_roundIdTracker;
        Round storage round = _rounds[roundId];
        round.teacherJobId = teacherJobId;
        round.teacher = teacher;
        round.difficulty = difficulty;
        round.difficultyDelta = 0;
        round.startedAt = uint64(block.timestamp);
        round.closed = false;
        round.finalized = false;
        round.aborted = false;

        emit RoundStarted(roundId, teacherJobId, teacher, difficulty, round.startedAt);
    }

    /// @notice Registers a student job for an active round.
    function registerStudentJob(uint256 roundId, uint256 jobId, address student)
        external
        whenNotPaused
        onlyOwnerOrchestrator
    {
        if (jobId == 0) revert InvalidJobId();
        if (student == address(0)) revert InvalidAddress();

        Round storage round = _requireRound(roundId);
        if (round.closed) revert RoundAlreadyClosed(roundId);
        if (round.aborted) revert RoundIsAborted(roundId);
        _ensureUnique(round.students, student);

        round.studentJobIds.push(jobId);
        round.students.push(student);

        emit StudentRegistered(roundId, jobId, student);
    }

    /// @notice Registers an optional validator job for an active round.
    function registerValidatorJob(uint256 roundId, uint256 jobId, address validator)
        external
        whenNotPaused
        onlyOwnerOrchestrator
    {
        if (jobId == 0) revert InvalidJobId();
        if (validator == address(0)) revert InvalidAddress();

        Round storage round = _requireRound(roundId);
        if (round.closed) revert RoundAlreadyClosed(roundId);
        if (round.aborted) revert RoundIsAborted(roundId);
        _ensureUnique(round.validators, validator);

        round.validatorJobIds.push(jobId);
        round.validators.push(validator);

        emit ValidatorRegistered(roundId, jobId, validator);
    }

    /// @notice Closes a round preventing further registrations.
    function closeRound(uint256 roundId) external whenNotPaused onlyOwnerOrchestrator {
        Round storage round = _requireRound(roundId);
        if (round.closed) revert RoundAlreadyClosed(roundId);
        if (round.aborted) revert RoundIsAborted(roundId);

        round.closed = true;
        round.closedAt = uint64(block.timestamp);

        emit RoundClosed(roundId, round.closedAt);
    }

    /// @notice Finalizes a round, applying difficulty adjustments and optionally slashing validators.
    function finalizeRound(
        uint256 roundId,
        int32 difficultyDelta,
        address[] calldata slashedValidators,
        uint256 slashAmount,
        address slashRecipient
    ) external whenNotPaused onlyOwnerOrchestrator nonReentrant {
        Round storage round = _requireRound(roundId);
        if (!round.closed) revert RoundNotClosed(roundId);
        if (round.finalized) revert RoundAlreadyFinalized(roundId);
        if (round.aborted) revert RoundIsAborted(roundId);

        uint32 previousDifficulty = round.difficulty;
        uint32 newDifficulty = _applyDifficultyDelta(previousDifficulty, difficultyDelta);

        round.finalized = true;
        round.finalizedAt = uint64(block.timestamp);
        round.difficulty = newDifficulty;
        round.difficultyDelta = difficultyDelta;

        if (slashedValidators.length > 0) {
            if (slashAmount == 0) revert InvalidSlashAmount();
            if (slashRecipient == address(0)) revert InvalidAddress();
            if (address(stakeManager) == address(0)) revert StakeManagerNotSet();
            _slashValidators(roundId, slashedValidators, slashAmount, slashRecipient);
        }

        emit RoundFinalized(roundId, previousDifficulty, difficultyDelta, newDifficulty, round.finalizedAt);
    }

    /// @notice Aborts a round, preventing further actions.
    function abortRound(uint256 roundId) external onlyOwnerOrchestrator {
        Round storage round = _requireRound(roundId);
        if (round.finalized) revert RoundAlreadyFinalized(roundId);
        if (round.aborted) revert RoundIsAborted(roundId);

        round.aborted = true;
        round.abortedAt = uint64(block.timestamp);
        if (!round.closed) {
            round.closed = true;
            round.closedAt = round.abortedAt;
        }

        emit RoundAborted(roundId, round.abortedAt);
    }

    /// @notice Returns the total number of rounds created.
    function totalRounds() external view returns (uint256) {
        return _roundIdTracker;
    }

    /// @notice Returns a view struct for the specified round.
    function getRound(uint256 roundId) external view returns (RoundView memory viewRound) {
        Round storage round = _requireRound(roundId);

        viewRound.id = roundId;
        viewRound.teacherJobId = round.teacherJobId;
        viewRound.difficulty = round.difficulty;
        viewRound.difficultyDelta = round.difficultyDelta;
        viewRound.startedAt = round.startedAt;
        viewRound.closedAt = round.closedAt;
        viewRound.finalizedAt = round.finalizedAt;
        viewRound.abortedAt = round.abortedAt;
        viewRound.closed = round.closed;
        viewRound.finalized = round.finalized;
        viewRound.aborted = round.aborted;
        viewRound.teacher = round.teacher;
        viewRound.studentJobIds = _copyUintArray(round.studentJobIds);
        viewRound.students = _copyAddressArray(round.students);
        viewRound.validatorJobIds = _copyUintArray(round.validatorJobIds);
        viewRound.validators = _copyAddressArray(round.validators);
    }

    function _requireRound(uint256 roundId) internal view returns (Round storage) {
        Round storage round = _rounds[roundId];
        if (round.startedAt == 0) revert RoundNotFound(roundId);
        return round;
    }

    function _ensureUnique(address[] storage list, address candidate) internal view {
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == candidate) revert DuplicateParticipant(candidate);
        }
    }

    function _applyDifficultyDelta(uint32 currentDifficulty, int32 difficultyDelta) internal pure returns (uint32) {
        int256 updated = int256(uint256(currentDifficulty)) + int256(difficultyDelta);
        if (updated < 0 || updated > int256(uint256(type(uint32).max))) revert InvalidDifficultyDelta();
        return uint32(uint256(updated));
    }

    function _slashValidators(
        uint256 roundId,
        address[] calldata validators,
        uint256 slashAmount,
        address slashRecipient
    ) internal {
        for (uint256 i = 0; i < validators.length; i++) {
            address validator = validators[i];
            if (validator == address(0)) revert InvalidAddress();
            stakeManager.slash(validator, slashAmount, slashRecipient);
            emit ValidatorSlashed(roundId, validator, slashAmount, slashRecipient);
        }
    }

    function _copyUintArray(uint256[] storage source) internal view returns (uint256[] memory copy) {
        copy = new uint256[](source.length);
        for (uint256 i = 0; i < source.length; i++) {
            copy[i] = source[i];
        }
    }

    function _copyAddressArray(address[] storage source) internal view returns (address[] memory copy) {
        copy = new address[](source.length);
        for (uint256 i = 0; i < source.length; i++) {
            copy[i] = source[i];
        }
    }
}
