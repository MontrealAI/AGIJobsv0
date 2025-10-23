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

interface IJobRegistry {
    struct Job {
        address employer;
        address agent;
        uint128 reward;
        uint96 stake;
        uint128 burnReceiptAmount;
        bytes32 uriHash;
        bytes32 resultHash;
        bytes32 specHash;
        uint256 packedMetadata;
    }

    error InvalidJob(uint256 jobId);

    function jobs(uint256 jobId) external view returns (Job memory);
}

interface IValidationModule {
    function start(uint256 jobId, uint256 entropy) external returns (address[] memory validators);

    function finalize(uint256 jobId) external returns (bool success);

    function forceFinalize(uint256 jobId) external returns (bool success);
}

/// @title SelfPlayArena
/// @notice Coordinates self-play training rounds between teachers, students, and validators, integrating
///         with the JobRegistry, StakeManager, and ValidationModule stack.
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

    /// @notice Aggregate reward configuration for a completed round.
    struct RewardConfig {
        uint256 teacher;
        uint256 student;
        uint256 validator;
    }

    struct AggregatedResult {
        uint32 observedSuccessRateBps;
        uint256 rewardsDistributed;
        uint32 eloEventId;
        bool validationPassed;
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
        address[] winningValidators;
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
        bool validationPassed;
        uint64 startedAt;
        uint64 closedAt;
        uint64 finalizedAt;
        bool closed;
        bool finalized;
        address[] students;
        uint256[] studentJobIds;
        address[] validators;
        uint256[] validatorJobIds;
        address[] winningValidators;
    }

    /// @notice Latest round identifier.
    uint256 private _roundIdTracker;

    /// @notice Round storage by identifier.
    mapping(uint256 => Round) private _rounds;

    /// @notice Identity registry used to verify participant eligibility.
    IIdentityRegistry public identityRegistry;

    /// @notice External JobRegistry integration for job provenance.
    IJobRegistry public jobRegistry;

    /// @notice External StakeManager contract providing staking and slashing capabilities.
    IStakeManager public stakeManager;

    /// @notice Validation module orchestrating commit–reveal lifecycles.
    IValidationModule public validationModule;

    /// @notice Configured relayer orchestrating lifecycle operations.
    address public relayer;

    /// @notice Maximum number of students allowed per round.
    uint256 public committeeSize;

    /// @notice Minimum stake required for validators.
    uint256 public validatorStake;

    /// @notice Base rewards distributed per role.
    RewardConfig public baseRewards;

    /// @notice Target success rate expressed in basis points (0-10,000).
    uint32 public targetSuccessRateBps;

    /// @notice Maximum allowed absolute difficulty delta during finalisation.
    uint32 public maxDifficultyStep;

    event RelayerUpdated(address indexed previous, address indexed current);
    event RelayerAuthorizationUpdated(address indexed account, bool allowed);
    event IdentityRegistryUpdated(address indexed previous, address indexed current);
    event JobRegistryUpdated(address indexed previous, address indexed current);
    event StakeManagerUpdated(address indexed previous, address indexed current);
    event ValidationModuleUpdated(address indexed previous, address indexed current);
    event CommitteeParametersUpdated(uint256 previousSize, uint256 newSize, uint256 previousStake, uint256 newStake);
    event RewardsConfigUpdated(uint256 teacher, uint256 student, uint256 validator);
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
    event RewardsDistributed(
        uint256 indexed roundId,
        uint256 teacherReward,
        uint256 studentRewardTotal,
        uint256 validatorRewardTotal
    );
    event RoundFinalized(
        uint256 indexed roundId,
        uint32 previousDifficulty,
        int32 difficultyDelta,
        uint32 newDifficulty,
        uint32 observedSuccessRateBps,
        uint256 rewardsDistributed,
        uint32 eloEventId,
        bool validationPassed,
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
    error JobRegistryNotSet();
    error ValidationModuleNotSet();
    error ParticipantNotAuthorized(address participant, bytes32 role);
    error JobAgentMismatch(uint256 jobId, address expected, address actual);
    error RoundNotFound(uint256 roundId);
    error RoundAlreadyClosed(uint256 roundId);
    error RoundNotClosed(uint256 roundId);
    error RoundAlreadyFinalized(uint256 roundId);
    error DuplicateParticipant(address participant);
    error DuplicateWinner(address validator);
    error UnknownWinner(address validator);
    error CommitteeFull(uint256 roundId);
    error MissingSubmissions(uint256 roundId);
    error InvalidDifficultyDelta();
    error DifficultyStepExceeded(int32 requested, uint32 maxStep);
    error InvalidSuccessRate();
    error InvalidRewardConfig();
    error InvalidRewardAmount();
    error StakeManagerNotSet();
    error ValidatorNotRegistered(address validator);
    error InvalidSlashAmount();
    error ValidationFailed(uint256 roundId, uint256 jobId, bool forced);

    modifier onlyOwnerOrRelayer() {
        if (msg.sender != owner() && !hasRole(RELAYER_ROLE, msg.sender)) {
            revert Unauthorized();
        }
        _;
    }

    /// @dev Keeps AccessControl admin role in sync with ownership changes.
    function _transferOwnership(address newOwner) internal virtual override {
        address previousOwner = owner();
        super._transferOwnership(newOwner);

        if (previousOwner != address(0) && previousOwner != newOwner) {
            _revokeRole(DEFAULT_ADMIN_ROLE, previousOwner);
        }
        if (newOwner != address(0)) {
            _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
        }
    }

    constructor(
        address owner_,
        address orchestrator_,
        address identityRegistry_,
        address jobRegistry_,
        address stakeManager_,
        address validationModule_,
        uint256 committeeSize_,
        uint256 validatorStake_,
        RewardConfig memory rewards_,
        uint32 targetSuccessRateBps_,
        uint32 maxDifficultyStep_
    ) Ownable(owner_) {
        if (identityRegistry_ == address(0) || jobRegistry_ == address(0) || validationModule_ == address(0)) {
            revert InvalidAddress();
        }
        if (committeeSize_ == 0 || validatorStake_ == 0) revert InvalidRewardConfig();
        if (rewards_.teacher == 0 || rewards_.student == 0 || rewards_.validator == 0) {
            revert InvalidRewardConfig();
        }
        if (targetSuccessRateBps_ == 0 || targetSuccessRateBps_ > 10_000) revert InvalidSuccessRate();
        if (maxDifficultyStep_ == 0) revert InvalidRewardConfig();

        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        identityRegistry = IIdentityRegistry(identityRegistry_);
        jobRegistry = IJobRegistry(jobRegistry_);
        stakeManager = IStakeManager(stakeManager_);
        validationModule = IValidationModule(validationModule_);
        committeeSize = committeeSize_;
        validatorStake = validatorStake_;
        baseRewards = rewards_;
        targetSuccessRateBps = targetSuccessRateBps_;
        maxDifficultyStep = maxDifficultyStep_;

        if (orchestrator_ != address(0)) {
            _grantRole(RELAYER_ROLE, orchestrator_);
        }
        relayer = orchestrator_;

        emit IdentityRegistryUpdated(address(0), identityRegistry_);
        emit JobRegistryUpdated(address(0), jobRegistry_);
        emit StakeManagerUpdated(address(0), stakeManager_);
        emit ValidationModuleUpdated(address(0), validationModule_);
        emit CommitteeParametersUpdated(0, committeeSize_, 0, validatorStake_);
        emit RewardsConfigUpdated(rewards_.teacher, rewards_.student, rewards_.validator);
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

    /// @notice Allows the owner to toggle additional relayer accounts.
    function setRelayerAuthorization(address account, bool allowed) external onlyOwner {
        if (allowed) {
            _grantRole(RELAYER_ROLE, account);
        } else {
            _revokeRole(RELAYER_ROLE, account);
        }
        emit RelayerAuthorizationUpdated(account, allowed);
    }

    /// @notice Updates the identity registry reference.
    function setIdentityRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) revert InvalidAddress();
        address previous = address(identityRegistry);
        identityRegistry = IIdentityRegistry(newRegistry);
        emit IdentityRegistryUpdated(previous, newRegistry);
    }

    /// @notice Updates the JobRegistry integration contract.
    function setJobRegistry(address newJobRegistry) external onlyOwner {
        if (newJobRegistry == address(0)) revert InvalidAddress();
        address previous = address(jobRegistry);
        jobRegistry = IJobRegistry(newJobRegistry);
        emit JobRegistryUpdated(previous, newJobRegistry);
    }

    /// @notice Updates the StakeManager integration contract.
    function setStakeManager(address newStakeManager) external onlyOwner {
        address previous = address(stakeManager);
        stakeManager = IStakeManager(newStakeManager);
        emit StakeManagerUpdated(previous, newStakeManager);
    }

    /// @notice Updates the ValidationModule contract.
    function setValidationModule(address newValidationModule) external onlyOwner {
        if (newValidationModule == address(0)) revert InvalidAddress();
        address previous = address(validationModule);
        validationModule = IValidationModule(newValidationModule);
        emit ValidationModuleUpdated(previous, newValidationModule);
    }

    /// @notice Updates the committee size limit and validator stake requirement.
    function setCommitteeParameters(uint256 newCommitteeSize, uint256 newValidatorStake) external onlyOwner {
        if (newCommitteeSize == 0 || newValidatorStake == 0) revert InvalidRewardConfig();
        emit CommitteeParametersUpdated(committeeSize, newCommitteeSize, validatorStake, newValidatorStake);
        committeeSize = newCommitteeSize;
        validatorStake = newValidatorStake;
    }

    /// @notice Updates the base reward expectation broadcast to off-chain components.
    function setRewards(uint256 teacher, uint256 student, uint256 validator) external onlyOwner {
        if (teacher == 0 || student == 0 || validator == 0) revert InvalidRewardConfig();
        baseRewards = RewardConfig({teacher: teacher, student: student, validator: validator});
        emit RewardsConfigUpdated(teacher, student, validator);
    }

    /// @notice View helper returning the configured teacher reward.
    function baseTeacherReward() external view returns (uint256) {
        return baseRewards.teacher;
    }

    /// @notice View helper returning the configured student reward per participant.
    function baseStudentReward() external view returns (uint256) {
        return baseRewards.student;
    }

    /// @notice View helper returning the configured validator reward per winner.
    function baseValidatorReward() external view returns (uint256) {
        return baseRewards.validator;
    }

    /// @notice Updates the target success rate used by orchestrators.
    function setTargetSuccessRateBps(uint32 newTargetSuccessRateBps) external onlyOwner {
        if (newTargetSuccessRateBps == 0 || newTargetSuccessRateBps > 10_000) revert InvalidSuccessRate();
        emit TargetSuccessRateUpdated(targetSuccessRateBps, newTargetSuccessRateBps);
        targetSuccessRateBps = newTargetSuccessRateBps;
    }

    /// @notice Updates the maximum permitted difficulty adjustment per round.
    function setMaxDifficultyStep(uint32 newMaxDifficultyStep) external onlyOwner {
        if (newMaxDifficultyStep == 0) revert InvalidRewardConfig();
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

    /// @notice Starts a new self-play round and notifies the ValidationModule.
    function startRound(uint256 teacherJobId, address teacher, uint32 difficulty)
        external
        whenNotPaused
        onlyOwnerOrRelayer
        returns (uint256 roundId)
    {
        if (teacherJobId == 0) revert InvalidJobId();
        if (teacher == address(0)) revert InvalidAddress();
        _assertIdentity(teacher, TEACHER_ROLE);
        _assertTeacherJob(teacherJobId, teacher);

        roundId = ++_roundIdTracker;
        Round storage round = _rounds[roundId];
        round.teacherJobId = teacherJobId;
        round.teacher = teacher;
        round.difficulty = difficulty;
        round.difficultyDelta = 0;
        round.startedAt = uint64(block.timestamp);
        round.closed = false;
        round.finalized = false;

        IValidationModule module = validationModule;
        if (address(module) == address(0)) revert ValidationModuleNotSet();
        module.start(teacherJobId, uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, roundId))));

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
            _verifyJobAgent(jobId, participant);
            round.studentJobIds.push(jobId);
            round.students.push(participant);
            emit StudentRegistered(roundId, jobId, participant);
        } else {
            _assertIdentity(participant, VALIDATOR_ROLE);
            _ensureUnique(round.validators, participant);
            _verifyJobAgent(jobId, participant);
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
    /// @param roundId Identifier of the round.
    /// @param difficultyDelta Signed delta applied to the previous difficulty.
    /// @param observedSuccessRateBps Observed success rate in basis points.
    /// @param eloEventId External identifier for Elo adjustments.
    /// @param forceFinalize Whether to call ValidationModule.forceFinalize instead of finalize.
    /// @param winningValidators List of validators that satisfied commit–reveal requirements.
    function finalizeRound(
        uint256 roundId,
        int32 difficultyDelta,
        uint32 observedSuccessRateBps,
        uint32 eloEventId,
        bool forceFinalize,
        address[] calldata winningValidators
    ) external whenNotPaused onlyOwnerOrRelayer nonReentrant {
        Round storage round = _requireRound(roundId);
        if (!round.closed) revert RoundNotClosed(roundId);
        if (round.finalized) revert RoundAlreadyFinalized(roundId);
        if (round.students.length == 0) revert MissingSubmissions(roundId);
        if (observedSuccessRateBps > 10_000) revert InvalidSuccessRate();

        uint32 previousDifficulty = round.difficulty;
        if (_abs(difficultyDelta) > int32(uint32(maxDifficultyStep))) {
            revert DifficultyStepExceeded(difficultyDelta, maxDifficultyStep);
        }
        int256 updated = int256(uint256(previousDifficulty)) + int256(difficultyDelta);
        if (updated < 0 || updated > int256(uint256(type(uint32).max))) revert InvalidDifficultyDelta();

        bool validationPassed = _finalizeValidation(roundId, round.teacherJobId, forceFinalize);

        round.finalized = true;
        round.finalizedAt = uint64(block.timestamp);
        round.difficultyDelta = difficultyDelta;
        round.difficulty = uint32(uint256(updated));
        round.results.eloEventId = eloEventId;
        round.results.observedSuccessRateBps = observedSuccessRateBps;
        round.results.validationPassed = validationPassed;

        _storeWinners(round, winningValidators);

        (uint256 teacherRewardTotal, uint256 studentRewardTotal, uint256 validatorRewardTotal) = _calculateRewardTotals(
            round
        );
        uint256 totalRewards = teacherRewardTotal + studentRewardTotal + validatorRewardTotal;
        round.results.rewardsDistributed = totalRewards;

        emit RewardsDistributed(roundId, teacherRewardTotal, studentRewardTotal, validatorRewardTotal);
        emit RoundFinalized(
            roundId,
            previousDifficulty,
            difficultyDelta,
            round.difficulty,
            observedSuccessRateBps,
            totalRewards,
            eloEventId,
            validationPassed,
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
        viewRound.validationPassed = round.results.validationPassed;
        viewRound.startedAt = round.startedAt;
        viewRound.closedAt = round.closedAt;
        viewRound.finalizedAt = round.finalizedAt;
        viewRound.closed = round.closed;
        viewRound.finalized = round.finalized;
        viewRound.students = _copyAddressArray(round.students);
        viewRound.studentJobIds = _copyUintArray(round.studentJobIds);
        viewRound.validators = _copyAddressArray(round.validators);
        viewRound.validatorJobIds = _copyUintArray(round.validatorJobIds);
        viewRound.winningValidators = _copyAddressArray(round.winningValidators);
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

    function _assertTeacherJob(uint256 jobId, address teacher) internal view {
        IJobRegistry.Job memory job = _loadJob(jobId);
        if (job.agent != teacher) {
            revert JobAgentMismatch(jobId, job.agent, teacher);
        }
    }

    function _verifyJobAgent(uint256 jobId, address participant) internal view {
        IJobRegistry.Job memory job = _loadJob(jobId);
        if (job.agent != participant) {
            revert JobAgentMismatch(jobId, job.agent, participant);
        }
    }

    function _loadJob(uint256 jobId) internal view returns (IJobRegistry.Job memory job) {
        IJobRegistry registry = jobRegistry;
        if (address(registry) == address(0)) revert JobRegistryNotSet();
        job = registry.jobs(jobId);
        if (job.agent == address(0)) {
            revert JobAgentMismatch(jobId, address(0), address(0));
        }
    }

    function _finalizeValidation(uint256 roundId, uint256 jobId, bool forceFinalize) internal returns (bool) {
        IValidationModule module = validationModule;
        if (address(module) == address(0)) revert ValidationModuleNotSet();
        bool success = forceFinalize ? module.forceFinalize(jobId) : module.finalize(jobId);
        if (!success) {
            revert ValidationFailed(roundId, jobId, forceFinalize);
        }
        return success;
    }

    function _storeWinners(Round storage round, address[] calldata winners) internal {
        uint256 winnersLength = winners.length;
        if (winnersLength == 0) {
            delete round.winningValidators;
            return;
        }
        round.winningValidators = new address[](winnersLength);
        for (uint256 i = 0; i < winnersLength; i++) {
            address candidate = winners[i];
            if (!_contains(round.validators, candidate)) revert UnknownWinner(candidate);
            for (uint256 j = 0; j < i; j++) {
                if (round.winningValidators[j] == candidate) revert DuplicateWinner(candidate);
            }
            round.winningValidators[i] = candidate;
        }
    }

    function _calculateRewardTotals(Round storage round)
        internal
        view
        returns (uint256 teacherReward, uint256 studentReward, uint256 validatorReward)
    {
        teacherReward = baseRewards.teacher;
        studentReward = baseRewards.student * round.students.length;
        uint256 winnersLength = round.winningValidators.length;
        if (winnersLength == 0) {
            winnersLength = round.validators.length;
        }
        validatorReward = baseRewards.validator * winnersLength;
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
