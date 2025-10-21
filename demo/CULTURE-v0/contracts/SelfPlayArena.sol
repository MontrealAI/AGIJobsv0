// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IIdentityRegistry {
    function hasRole(bytes32 role, address account) external view returns (bool);
}

/// @title SelfPlayArena
/// @notice Coordinates self-play rounds for teacher, student, and validator agents.
contract SelfPlayArena is Ownable, Pausable, ReentrancyGuard {
    bytes32 public constant TEACHER_ROLE = keccak256("TEACHER_ROLE");
    bytes32 public constant STUDENT_ROLE = keccak256("STUDENT_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

    struct Round {
        uint32 difficulty;
        uint64 startedAt;
        uint64 closedAt;
        bool finalized;
        uint256 teacherJobId;
        address teacher;
        uint256[] studentJobIds;
        address[] students;
        uint256[] validatorJobIds;
        address[] validators;
        address[] winners;
        int32 difficultyDelta;
    }

    struct RoundView {
        uint256 id;
        uint32 difficulty;
        uint64 startedAt;
        uint64 closedAt;
        bool finalized;
        uint256 teacherJobId;
        address teacher;
        uint256[] studentJobIds;
        address[] students;
        uint256[] validatorJobIds;
        address[] validators;
        address[] winners;
        int32 difficultyDelta;
    }

    uint256 private _roundIdCounter;
    mapping(uint256 => Round) private _rounds;

    mapping(address => bool) public orchestrators;
    IIdentityRegistry public identityRegistry;

    uint256 public baseTeacherReward;
    uint256 public baseStudentReward;
    uint256 public baseValidatorReward;
    uint256 public committeeSize;
    uint256 public validatorStake;
    uint256 public targetSuccessRateBps;

    event OrchestratorUpdated(address indexed orchestrator, bool allowed);
    event IdentityRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event RewardsUpdated(uint256 teacherReward, uint256 studentReward, uint256 validatorReward);
    event CommitteeParametersUpdated(uint256 committeeSize, uint256 validatorStake);
    event TargetSuccessRateUpdated(uint256 targetSuccessRateBps);
    event RoundStarted(uint256 indexed roundId, uint32 difficulty, uint256 teacherJobId, address indexed teacher);
    event StudentRegistered(uint256 indexed roundId, uint256 jobId, address indexed student);
    event ValidatorRegistered(uint256 indexed roundId, uint256 jobId, address indexed validator);
    event RoundClosed(uint256 indexed roundId, uint64 closedAt);
    event RoundFinalized(uint256 indexed roundId, address[] winners, int32 difficultyDelta);

    error NotAuthorised();
    error InvalidIdentity(address account, bytes32 role);
    error RoundNotFound(uint256 roundId);
    error RoundClosedAlready(uint256 roundId);
    error RoundNotClosed(uint256 roundId);
    error RoundAlreadyFinalized(uint256 roundId);
    error DuplicateParticipant();
    error ZeroValue();
    error InvalidJob();

    modifier onlyOperator() {
        if (!orchestrators[msg.sender] && msg.sender != owner()) revert NotAuthorised();
        _;
    }

    constructor(
        address owner_,
        address identityRegistry_,
        uint256 teacherReward,
        uint256 studentReward,
        uint256 validatorReward,
        uint256 committeeSize_,
        uint256 validatorStake_,
        uint256 targetSuccessRateBps_
    ) Ownable(owner_) {
        identityRegistry = IIdentityRegistry(identityRegistry_);
        baseTeacherReward = teacherReward;
        baseStudentReward = studentReward;
        baseValidatorReward = validatorReward;
        committeeSize = committeeSize_;
        validatorStake = validatorStake_;
        targetSuccessRateBps = targetSuccessRateBps_;
    }

    function setOrchestrator(address orchestrator, bool allowed) external onlyOwner {
        orchestrators[orchestrator] = allowed;
        emit OrchestratorUpdated(orchestrator, allowed);
    }

    function setIdentityRegistry(address newRegistry) external onlyOwner {
        address previous = address(identityRegistry);
        identityRegistry = IIdentityRegistry(newRegistry);
        emit IdentityRegistryUpdated(previous, newRegistry);
    }

    function setRewards(uint256 teacherReward, uint256 studentReward, uint256 validatorReward) external onlyOwner {
        if (teacherReward == 0 || studentReward == 0 || validatorReward == 0) revert ZeroValue();
        baseTeacherReward = teacherReward;
        baseStudentReward = studentReward;
        baseValidatorReward = validatorReward;
        emit RewardsUpdated(teacherReward, studentReward, validatorReward);
    }

    function setCommitteeParameters(uint256 committeeSize_, uint256 validatorStake_) external onlyOwner {
        if (committeeSize_ == 0 || validatorStake_ == 0) revert ZeroValue();
        committeeSize = committeeSize_;
        validatorStake = validatorStake_;
        emit CommitteeParametersUpdated(committeeSize_, validatorStake_);
    }

    function setTargetSuccessRateBps(uint256 targetSuccessRateBps_) external onlyOwner {
        if (targetSuccessRateBps_ == 0 || targetSuccessRateBps_ > 10_000) revert ZeroValue();
        targetSuccessRateBps = targetSuccessRateBps_;
        emit TargetSuccessRateUpdated(targetSuccessRateBps_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function startRound(uint32 difficulty, uint256 teacherJobId, address teacher)
        external
        whenNotPaused
        onlyOperator
        nonReentrant
        returns (uint256 roundId)
    {
        if (teacherJobId == 0) revert InvalidJob();
        _validateIdentity(teacher, TEACHER_ROLE);

        roundId = ++_roundIdCounter;
        Round storage round = _rounds[roundId];
        round.difficulty = difficulty;
        round.startedAt = uint64(block.timestamp);
        round.teacherJobId = teacherJobId;
        round.teacher = teacher;

        emit RoundStarted(roundId, difficulty, teacherJobId, teacher);
    }

    function registerStudentJob(uint256 roundId, uint256 jobId, address student)
        external
        whenNotPaused
        onlyOperator
    {
        Round storage round = _requireRound(roundId);
        if (round.closedAt != 0) revert RoundClosedAlready(roundId);
        if (jobId == 0) revert InvalidJob();
        _validateIdentity(student, STUDENT_ROLE);
        _ensureUnique(round.students, student);

        round.studentJobIds.push(jobId);
        round.students.push(student);

        emit StudentRegistered(roundId, jobId, student);
    }

    function registerValidatorJob(uint256 roundId, uint256 jobId, address validator)
        external
        whenNotPaused
        onlyOperator
    {
        Round storage round = _requireRound(roundId);
        if (round.closedAt != 0) revert RoundClosedAlready(roundId);
        if (jobId == 0) revert InvalidJob();
        _validateIdentity(validator, VALIDATOR_ROLE);
        _ensureUnique(round.validators, validator);

        round.validatorJobIds.push(jobId);
        round.validators.push(validator);

        emit ValidatorRegistered(roundId, jobId, validator);
    }

    function closeRound(uint256 roundId) external whenNotPaused onlyOperator {
        Round storage round = _requireRound(roundId);
        if (round.closedAt != 0) revert RoundClosedAlready(roundId);
        round.closedAt = uint64(block.timestamp);
        emit RoundClosed(roundId, round.closedAt);
    }

    function finalizeRound(uint256 roundId, address[] calldata winners, int32 difficultyDelta)
        external
        whenNotPaused
        onlyOperator
        nonReentrant
    {
        Round storage round = _requireRound(roundId);
        if (round.closedAt == 0) revert RoundNotClosed(roundId);
        if (round.finalized) revert RoundAlreadyFinalized(roundId);

        round.finalized = true;
        round.difficultyDelta = difficultyDelta;

        uint256 winnersLength = winners.length;
        for (uint256 i = 0; i < winnersLength; i++) {
            round.winners.push(winners[i]);
        }

        emit RoundFinalized(roundId, winners, difficultyDelta);
    }

    function getRound(uint256 roundId) external view returns (RoundView memory viewRound) {
        Round storage round = _rounds[roundId];
        if (round.startedAt == 0) revert RoundNotFound(roundId);

        viewRound.id = roundId;
        viewRound.difficulty = round.difficulty;
        viewRound.startedAt = round.startedAt;
        viewRound.closedAt = round.closedAt;
        viewRound.finalized = round.finalized;
        viewRound.teacherJobId = round.teacherJobId;
        viewRound.teacher = round.teacher;
        viewRound.difficultyDelta = round.difficultyDelta;

        viewRound.studentJobIds = _copyUintArray(round.studentJobIds);
        viewRound.students = _copyAddressArray(round.students);
        viewRound.validatorJobIds = _copyUintArray(round.validatorJobIds);
        viewRound.validators = _copyAddressArray(round.validators);
        viewRound.winners = _copyAddressArray(round.winners);
    }

    function totalRounds() external view returns (uint256) {
        return _roundIdCounter;
    }

    function _validateIdentity(address account, bytes32 role) internal view {
        if (account == address(0)) revert InvalidIdentity(account, role);
        if (account == owner()) {
            return;
        }
        if (address(identityRegistry) == address(0)) {
            revert InvalidIdentity(account, role);
        }
        if (!identityRegistry.hasRole(role, account)) {
            revert InvalidIdentity(account, role);
        }
    }

    function _requireRound(uint256 roundId) internal view returns (Round storage) {
        Round storage round = _rounds[roundId];
        if (round.startedAt == 0) revert RoundNotFound(roundId);
        return round;
    }

    function _ensureUnique(address[] storage list, address candidate) internal view {
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == candidate) revert DuplicateParticipant();
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
