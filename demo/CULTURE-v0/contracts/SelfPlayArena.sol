// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IIdentityRegistry {
    function hasRole(bytes32 role, address account) external view returns (bool);
}

interface IStakeManager {
    function slash(address user, uint256 amount, address recipient) external;
}

/// @title SelfPlayArena
/// @notice Coordinates self-play training rounds between teachers, students and validators.
contract SelfPlayArena is Ownable, AccessControl, Pausable, ReentrancyGuard {
    /// @notice Role identifier allowing orchestrator style automation.
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /// @notice Identity registry roles enforced for participants.
    bytes32 public constant TEACHER_ROLE = keccak256("TEACHER_ROLE");
    bytes32 public constant STUDENT_ROLE = keccak256("STUDENT_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

    /// @notice Participant kind supported by {registerParticipant}.
    enum ParticipantKind {
        Student,
        Validator
    }

    struct AggregatedResult {
        uint32 observedSuccessRateBps;
        uint256 rewardsDistributed;
        uint32 eloEventId;
    }

    struct Round {
        uint256 teacherJobId;
        address teacher;
        uint32 difficulty;
        int32 difficultyDelta;
        uint64 startedAt;
        uint64 closedAt;
        uint64 finalizedAt;
        bool closed;
        bool finalized;
        address[] students;
        uint256[] studentJobIds;
        address[] validators;
        uint256[] validatorJobIds;
        AggregatedResult results;
    }

    struct RoundView {
        uint256 id;
        uint256 teacherJobId;
        address teacher;
        uint32 difficulty;
        int32 difficultyDelta;
        uint32 observedSuccessRateBps;
        uint256 rewardsDistributed;
        uint32 eloEventId;
        uint64 startedAt;
        uint64 closedAt;
        uint64 finalizedAt;
        bool closed;
        bool finalized;
        address[] students;
        uint256[] studentJobIds;
        address[] validators;
        uint256[] validatorJobIds;
    }

    /// @notice Latest round identifier.
    uint256 private _roundIdTracker;

    /// @notice Round storage by identifier.
    mapping(uint256 => Round) private _rounds;

    /// @notice Identity registry used to verify participant eligibility.
    IIdentityRegistry public identityRegistry;

    /// @notice External StakeManager contract providing staking and slashing capabilities.
    IStakeManager public stakeManager;

    /// @notice Configured relayer orchestrating lifecycle operations.
    address public relayer;

    /// @notice Maximum number of students allowed per round.
    uint256 public committeeSize;

    /// @notice Minimum aggregate reward expected to be distributed on finalisation.
    uint256 public baseReward;

    /// @notice Target success rate expressed in basis points (0-10,000).
    uint32 public targetSuccessRateBps;

    /// @notice Maximum allowed absolute difficulty delta during finalisation.
    uint32 public maxDifficultyStep;

    event RelayerUpdated(address indexed previous, address indexed current);
    event IdentityRegistryUpdated(address indexed previous, address indexed current);
    event StakeManagerUpdated(address indexed previous, address indexed current);
    event CommitteeSizeUpdated(uint256 previous, uint256 current);
    event BaseRewardUpdated(uint256 previous, uint256 current);
    event TargetSuccessRateUpdated(uint32 previous, uint32 current);
    event MaxDifficultyStepUpdated(uint32 previous, uint32 current);

    event RoundStarted(
        uint256 indexed roundId,
        uint256 indexed teacherJobId,
        address indexed teacher,
        uint32 difficulty,
        uint64 startedAt
    );
    event StudentRegistered(uint256 indexed roundId, uint256 indexed jobId, address indexed student);
    event ValidatorRegistered(uint256 indexed roundId, uint256 indexed jobId, address indexed validator);
    event RoundClosed(uint256 indexed roundId, uint64 closedAt);
    event RoundFinalized(
        uint256 indexed roundId,
        uint32 previousDifficulty,
        int32 difficultyDelta,
        uint32 newDifficulty,
        uint32 observedSuccessRateBps,
        uint256 rewardsDistributed,
        uint32 eloEventId,
        uint64 finalizedAt
    );
    event ValidatorSlashed(
        uint256 indexed roundId,
        address indexed validator,
        uint256 amount,
        address indexed recipient,
        string reason
    );

    error Unauthorized();
    error InvalidAddress();
    error InvalidJobId();
    error IdentityRegistryNotSet();
    error ParticipantNotAuthorized(address participant, bytes32 role);
    error RoundNotFound(uint256 roundId);
    error RoundAlreadyClosed(uint256 roundId);
    error RoundNotClosed(uint256 roundId);
    error RoundAlreadyFinalized(uint256 roundId);
    error DuplicateParticipant(address participant);
    error CommitteeFull(uint256 roundId);
    error MissingSubmissions(uint256 roundId);
    error InvalidDifficultyDelta();
    error DifficultyStepExceeded(int32 requested, uint32 maxStep);
    error InvalidSuccessRate();
    error InvalidRewardAmount();
    error StakeManagerNotSet();
    error ValidatorNotRegistered(address validator);
    error InvalidSlashAmount();

    modifier onlyOwnerOrRelayer() {
        if (msg.sender != owner() && !hasRole(RELAYER_ROLE, msg.sender)) {
            revert Unauthorized();
        }
        _;
    }

    constructor(
        address owner_,
        address orchestrator_,
        address identityRegistry_,
        address stakeManager_,
        uint256 committeeSize_,
        uint256 baseReward_,
        uint32 targetSuccessRateBps_,
        uint32 maxDifficultyStep_
    ) Ownable(owner_) {
        if (identityRegistry_ == address(0)) revert InvalidAddress();
        if (committeeSize_ == 0 || baseReward_ == 0 || targetSuccessRateBps_ == 0 || maxDifficultyStep_ == 0) {
            revert InvalidRewardAmount();
        }
        if (targetSuccessRateBps_ > 10_000) revert InvalidSuccessRate();

        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        identityRegistry = IIdentityRegistry(identityRegistry_);
        stakeManager = IStakeManager(stakeManager_);
        committeeSize = committeeSize_;
        baseReward = baseReward_;
        targetSuccessRateBps = targetSuccessRateBps_;
        maxDifficultyStep = maxDifficultyStep_;

        if (orchestrator_ != address(0)) {
            _grantRole(RELAYER_ROLE, orchestrator_);
        }
        relayer = orchestrator_;

        emit IdentityRegistryUpdated(address(0), identityRegistry_);
        emit StakeManagerUpdated(address(0), stakeManager_);
        emit CommitteeSizeUpdated(0, committeeSize_);
        emit BaseRewardUpdated(0, baseReward_);
        emit TargetSuccessRateUpdated(0, targetSuccessRateBps_);
        emit MaxDifficultyStepUpdated(0, maxDifficultyStep_);
        emit RelayerUpdated(address(0), orchestrator_);
    }

    /// @notice Updates the relayer responsible for orchestrating the arena lifecycle.
    function setRelayer(address newRelayer) external onlyOwner {
        address previous = relayer;
        if (previous != address(0)) {
            _revokeRole(RELAYER_ROLE, previous);
        }
        relayer = newRelayer;
        if (newRelayer != address(0)) {
            _grantRole(RELAYER_ROLE, newRelayer);
        }
        emit RelayerUpdated(previous, newRelayer);
    }

    /// @notice Updates the identity registry reference.
    function setIdentityRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) revert InvalidAddress();
        address previous = address(identityRegistry);
        identityRegistry = IIdentityRegistry(newRegistry);
        emit IdentityRegistryUpdated(previous, newRegistry);
    }

    /// @notice Updates the StakeManager integration contract.
    function setStakeManager(address newStakeManager) external onlyOwner {
        address previous = address(stakeManager);
        stakeManager = IStakeManager(newStakeManager);
        emit StakeManagerUpdated(previous, newStakeManager);
    }

    /// @notice Updates the committee size limit for student registrations.
    function setCommitteeSize(uint256 newCommitteeSize) external onlyOwner {
        if (newCommitteeSize == 0) revert InvalidRewardAmount();
        emit CommitteeSizeUpdated(committeeSize, newCommitteeSize);
        committeeSize = newCommitteeSize;
    }

    /// @notice Updates the base reward expectation broadcast to off-chain components.
    function setBaseReward(uint256 newBaseReward) external onlyOwner {
        if (newBaseReward == 0) revert InvalidRewardAmount();
        emit BaseRewardUpdated(baseReward, newBaseReward);
        baseReward = newBaseReward;
    }

    /// @notice Updates the target success rate used by orchestrators.
    function setTargetSuccessRate(uint32 newTargetSuccessRateBps) external onlyOwner {
        if (newTargetSuccessRateBps == 0 || newTargetSuccessRateBps > 10_000) revert InvalidSuccessRate();
        emit TargetSuccessRateUpdated(targetSuccessRateBps, newTargetSuccessRateBps);
        targetSuccessRateBps = newTargetSuccessRateBps;
    }

    /// @notice Updates the maximum permitted difficulty adjustment per round.
    function setMaxDifficultyStep(uint32 newMaxDifficultyStep) external onlyOwner {
        if (newMaxDifficultyStep == 0) revert InvalidRewardAmount();
        emit MaxDifficultyStepUpdated(maxDifficultyStep, newMaxDifficultyStep);
        maxDifficultyStep = newMaxDifficultyStep;
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
        onlyOwnerOrRelayer
        returns (uint256 roundId)
    {
        if (teacherJobId == 0) revert InvalidJobId();
        if (teacher == address(0)) revert InvalidAddress();
        _assertIdentity(teacher, TEACHER_ROLE);

        roundId = ++_roundIdTracker;
        Round storage round = _rounds[roundId];
        round.teacherJobId = teacherJobId;
        round.teacher = teacher;
        round.difficulty = difficulty;
        round.difficultyDelta = 0;
        round.startedAt = uint64(block.timestamp);
        round.closed = false;
        round.finalized = false;

        emit RoundStarted(roundId, teacherJobId, teacher, difficulty, round.startedAt);
    }

    /// @notice Registers a participant for an active round.
    function registerParticipant(
        uint256 roundId,
        ParticipantKind participantKind,
        uint256 jobId,
        address participant
    ) external whenNotPaused onlyOwnerOrRelayer {
        if (jobId == 0) revert InvalidJobId();
        if (participant == address(0)) revert InvalidAddress();

        Round storage round = _requireRound(roundId);
        if (round.closed) revert RoundAlreadyClosed(roundId);
        if (round.finalized) revert RoundAlreadyFinalized(roundId);

        if (participantKind == ParticipantKind.Student) {
            _assertIdentity(participant, STUDENT_ROLE);
            if (round.students.length >= committeeSize) revert CommitteeFull(roundId);
            _ensureUnique(round.students, participant);
            round.studentJobIds.push(jobId);
            round.students.push(participant);
            emit StudentRegistered(roundId, jobId, participant);
        } else {
            _assertIdentity(participant, VALIDATOR_ROLE);
            _ensureUnique(round.validators, participant);
            round.validatorJobIds.push(jobId);
            round.validators.push(participant);
            emit ValidatorRegistered(roundId, jobId, participant);
        }
    }

    /// @notice Closes a round preventing further registrations.
    function closeRound(uint256 roundId) external whenNotPaused onlyOwnerOrRelayer {
        Round storage round = _requireRound(roundId);
        if (round.closed) revert RoundAlreadyClosed(roundId);
        round.closed = true;
        round.closedAt = uint64(block.timestamp);
        emit RoundClosed(roundId, round.closedAt);
    }

    /// @notice Finalizes a round, applying difficulty adjustments and recording aggregated results.
    function finalizeRound(
        uint256 roundId,
        int32 difficultyDelta,
        uint32 observedSuccessRateBps,
        uint256 rewardsDistributed,
        uint32 eloEventId
    ) external whenNotPaused onlyOwnerOrRelayer nonReentrant {
        Round storage round = _requireRound(roundId);
        if (!round.closed) revert RoundNotClosed(roundId);
        if (round.finalized) revert RoundAlreadyFinalized(roundId);
        if (round.students.length == 0) revert MissingSubmissions(roundId);
        if (observedSuccessRateBps > 10_000) revert InvalidSuccessRate();
        if (rewardsDistributed < baseReward) revert InvalidRewardAmount();

        uint32 previousDifficulty = round.difficulty;
        if (_abs(difficultyDelta) > int32(uint32(maxDifficultyStep))) {
            revert DifficultyStepExceeded(difficultyDelta, maxDifficultyStep);
        }
        int256 updated = int256(uint256(previousDifficulty)) + int256(difficultyDelta);
        if (updated < 0 || updated > int256(uint256(type(uint32).max))) revert InvalidDifficultyDelta();

        round.finalized = true;
        round.finalizedAt = uint64(block.timestamp);
        round.difficultyDelta = difficultyDelta;
        round.difficulty = uint32(uint256(updated));
        round.results = AggregatedResult({
            observedSuccessRateBps: observedSuccessRateBps,
            rewardsDistributed: rewardsDistributed,
            eloEventId: eloEventId
        });

        emit RoundFinalized(
            roundId,
            previousDifficulty,
            difficultyDelta,
            round.difficulty,
            observedSuccessRateBps,
            rewardsDistributed,
            eloEventId,
            round.finalizedAt
        );
    }

    /// @notice Reports validator misconduct and requests slashing through the StakeManager.
    function reportValidatorMisconduct(
        uint256 roundId,
        address validator,
        uint256 amount,
        address recipient,
        string calldata reason
    ) external whenNotPaused onlyOwnerOrRelayer nonReentrant {
        if (amount == 0) revert InvalidSlashAmount();
        if (recipient == address(0)) revert InvalidAddress();
        if (validator == address(0)) revert InvalidAddress();

        Round storage round = _requireRound(roundId);
        if (!_contains(round.validators, validator)) {
            revert ValidatorNotRegistered(validator);
        }

        IStakeManager manager = stakeManager;
        if (address(manager) == address(0)) revert StakeManagerNotSet();
        manager.slash(validator, amount, recipient);

        emit ValidatorSlashed(roundId, validator, amount, recipient, reason);
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
        viewRound.teacher = round.teacher;
        viewRound.difficulty = round.difficulty;
        viewRound.difficultyDelta = round.difficultyDelta;
        viewRound.observedSuccessRateBps = round.results.observedSuccessRateBps;
        viewRound.rewardsDistributed = round.results.rewardsDistributed;
        viewRound.eloEventId = round.results.eloEventId;
        viewRound.startedAt = round.startedAt;
        viewRound.closedAt = round.closedAt;
        viewRound.finalizedAt = round.finalizedAt;
        viewRound.closed = round.closed;
        viewRound.finalized = round.finalized;
        viewRound.students = _copyAddressArray(round.students);
        viewRound.studentJobIds = _copyUintArray(round.studentJobIds);
        viewRound.validators = _copyAddressArray(round.validators);
        viewRound.validatorJobIds = _copyUintArray(round.validatorJobIds);
    }

    /// @inheritdoc AccessControl
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _requireRound(uint256 roundId) internal view returns (Round storage) {
        Round storage round = _rounds[roundId];
        if (round.startedAt == 0) revert RoundNotFound(roundId);
        return round;
    }

    function _assertIdentity(address participant, bytes32 role) internal view {
        if (participant == owner()) {
            return;
        }
        IIdentityRegistry registry = identityRegistry;
        if (address(registry) == address(0)) revert IdentityRegistryNotSet();
        if (!registry.hasRole(role, participant)) {
            revert ParticipantNotAuthorized(participant, role);
        }
    }

    function _ensureUnique(address[] storage list, address candidate) internal view {
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == candidate) revert DuplicateParticipant(candidate);
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

    function _contains(address[] storage source, address candidate) internal view returns (bool) {
        for (uint256 i = 0; i < source.length; i++) {
            if (source[i] == candidate) {
                return true;
            }
        }
        return false;
    }

    function _abs(int32 value) internal pure returns (int32) {
        return value >= 0 ? value : int32(-value);
    }
}
