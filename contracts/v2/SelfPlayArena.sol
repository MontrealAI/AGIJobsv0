// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";

/// @title SelfPlayArena
/// @notice Coordinates self-play rounds between teacher, student, and validator agents.
/// @dev Invariants:
/// - Round identifiers increment monotonically and each round can only be
///   finalised once.
/// - Once `closedAt` is set a round can no longer accept new participants.
/// - Every registered participant must have passed IdentityRegistry attestation.
/// Emergency procedures:
/// - The owner can rotate orchestrators, update external module references,
///   or call {pause} to halt all round mutations before invoking
///   {reportValidatorMisconduct} or other follow-up remediations.
contract SelfPlayArena is Ownable, Pausable, ReentrancyGuard {
    struct Round {
        uint32 difficulty;
        uint64 startedAt;
        uint64 closedAt;
        bool finalised;
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
        bool finalised;
        uint256 teacherJobId;
        address teacher;
        uint256[] studentJobIds;
        address[] students;
        uint256[] validatorJobIds;
        address[] validators;
        address[] winners;
        int32 difficultyDelta;
    }

    /// @notice Role gatekeepers via the IdentityRegistry.
    IIdentityRegistry public identityRegistry;
    /// @notice Job registry pointer used to validate referenced jobs.
    IJobRegistry public jobRegistry;
    /// @notice Stake manager utilised to slash misbehaving validators.
    IStakeManager public stakeManager;
    /// @notice Fee pool used as the funding source for arena payouts.
    IFeePool public feePool;

    /// @notice Configured orchestrators allowed to manage rounds.
    mapping(address => bool) public orchestrators;

    /// @notice Economic parameters broadcast to off-chain services.
    uint256 public baseTeacherReward;
    uint256 public baseStudentReward;
    uint256 public baseValidatorReward;
    uint256 public committeeSize;
    uint256 public validatorStake;
    uint256 public targetSuccessRateBps;
    /// @notice Scaling factors (in basis points) applied to base rewards.
    uint16 public teacherRewardSplitBps = 10_000;
    uint16 public studentRewardSplitBps = 10_000;
    uint16 public validatorRewardSplitBps = 10_000;

    uint256 private constant _BPS_DENOMINATOR = 10_000;

    uint256 private _roundIdCounter;
    mapping(uint256 => Round) private _rounds;

    event OrchestratorUpdated(address indexed orchestrator, bool allowed);
    event IdentityRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event JobRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event StakeManagerUpdated(address indexed previousManager, address indexed newManager);
    event RewardsUpdated(uint256 teacherReward, uint256 studentReward, uint256 validatorReward);
    event CommitteeParametersUpdated(uint256 committeeSize, uint256 validatorStake);
    event TargetSuccessRateUpdated(uint256 targetSuccessRateBps);
    event FeePoolUpdated(address indexed previousFeePool, address indexed newFeePool);
    event RewardSplitsUpdated(uint16 teacherSplitBps, uint16 studentSplitBps, uint16 validatorSplitBps);
    event ParametersUpdated(
        uint256 teacherReward,
        uint256 studentReward,
        uint256 validatorReward,
        uint256 committeeSize,
        uint256 validatorStake,
        uint256 targetSuccessRateBps,
        uint16 teacherSplitBps,
        uint16 studentSplitBps,
        uint16 validatorSplitBps,
        address feePool
    );
    event RoundStarted(
        uint256 indexed roundId,
        uint32 difficulty,
        uint256 indexed teacherJobId,
        address indexed teacher,
        string teacherSubdomain
    );
    event StudentRegistered(
        uint256 indexed roundId,
        uint256 indexed jobId,
        address indexed student,
        string subdomain
    );
    event ValidatorRegistered(
        uint256 indexed roundId,
        uint256 indexed jobId,
        address indexed validator,
        string subdomain
    );
    event RoundClosed(uint256 indexed roundId, uint64 closedAt);
    event RoundFinalised(uint256 indexed roundId, address[] winners, int32 difficultyDelta);
    event RewardsDistributed(
        uint256 indexed roundId,
        uint256 teacherReward,
        uint256 studentRewardTotal,
        uint256 validatorRewardTotal
    );
    event ValidatorMisconduct(
        uint256 indexed roundId,
        address indexed validator,
        uint256 amount,
        address indexed recipient,
        string reason
    );

    error NotAuthorised();
    error IdentityRegistryNotSet();
    error InvalidAgent(address account);
    error InvalidValidator(address account);
    error InvalidJob(uint256 jobId);
    error ZeroAddress();
    error ZeroValue();
    error RoundNotFound(uint256 roundId);
    error RoundClosedAlready(uint256 roundId);
    error RoundNotClosed(uint256 roundId);
    error RoundFinalisedAlready(uint256 roundId);
    error DuplicateParticipant(address account);
    error CommitteeFull(uint256 roundId);
    error StakeManagerNotConfigured();
    error InvalidAmount();
    error FeePoolNotConfigured();
    error InvalidSplit();

    modifier onlyOperator() {
        if (msg.sender != owner() && !orchestrators[msg.sender]) {
            revert NotAuthorised();
        }
        _;
    }

    constructor(
        address owner_,
        address identityRegistry_,
        address jobRegistry_,
        address stakeManager_,
        uint256 teacherReward,
        uint256 studentReward,
        uint256 validatorReward,
        uint256 committeeSize_,
        uint256 validatorStake_,
        uint256 targetSuccessRateBps_
    ) Ownable(owner_) {
        if (identityRegistry_ == address(0) || jobRegistry_ == address(0)) {
            revert ZeroAddress();
        }
        if (
            teacherReward == 0 ||
            studentReward == 0 ||
            validatorReward == 0 ||
            committeeSize_ == 0 ||
            validatorStake_ == 0 ||
            targetSuccessRateBps_ == 0 ||
            targetSuccessRateBps_ > 10_000
        ) {
            revert ZeroValue();
        }
        identityRegistry = IIdentityRegistry(identityRegistry_);
        jobRegistry = IJobRegistry(jobRegistry_);
        stakeManager = IStakeManager(stakeManager_);
        baseTeacherReward = teacherReward;
        baseStudentReward = studentReward;
        baseValidatorReward = validatorReward;
        committeeSize = committeeSize_;
        validatorStake = validatorStake_;
        targetSuccessRateBps = targetSuccessRateBps_;
        emit ParametersUpdated(
            teacherReward,
            studentReward,
            validatorReward,
            committeeSize_,
            validatorStake_,
            targetSuccessRateBps_,
            teacherRewardSplitBps,
            studentRewardSplitBps,
            validatorRewardSplitBps,
            address(0)
        );
    }

    /// @notice Configure or revoke an orchestrator address.
    function setOrchestrator(address orchestrator, bool allowed) external onlyOwner {
        if (orchestrator == address(0)) {
            revert ZeroAddress();
        }
        orchestrators[orchestrator] = allowed;
        emit OrchestratorUpdated(orchestrator, allowed);
    }

    /// @notice Rotate the IdentityRegistry reference.
    function setIdentityRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) {
            revert ZeroAddress();
        }
        address previous = address(identityRegistry);
        identityRegistry = IIdentityRegistry(newRegistry);
        emit IdentityRegistryUpdated(previous, newRegistry);
    }

    /// @notice Update the JobRegistry hook.
    function setJobRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) {
            revert ZeroAddress();
        }
        address previous = address(jobRegistry);
        jobRegistry = IJobRegistry(newRegistry);
        emit JobRegistryUpdated(previous, newRegistry);
    }

    /// @notice Update the StakeManager used for validator slashing.
    function setStakeManager(address newManager) external onlyOwner {
        address previous = address(stakeManager);
        stakeManager = IStakeManager(newManager);
        emit StakeManagerUpdated(previous, newManager);
    }

    /// @notice Update the FeePool utilised for arena payouts.
    function setFeePool(address newFeePool) external onlyOwner {
        address previous = address(feePool);
        feePool = IFeePool(newFeePool);
        emit FeePoolUpdated(previous, newFeePool);
        emit ParametersUpdated(
            baseTeacherReward,
            baseStudentReward,
            baseValidatorReward,
            committeeSize,
            validatorStake,
            targetSuccessRateBps,
            teacherRewardSplitBps,
            studentRewardSplitBps,
            validatorRewardSplitBps,
            newFeePool
        );
    }

    /// @notice Update baseline rewards that downstream automation references.
    function setRewards(uint256 teacherReward, uint256 studentReward, uint256 validatorReward)
        external
        onlyOwner
    {
        if (teacherReward == 0 || studentReward == 0 || validatorReward == 0) {
            revert ZeroValue();
        }
        baseTeacherReward = teacherReward;
        baseStudentReward = studentReward;
        baseValidatorReward = validatorReward;
        emit RewardsUpdated(teacherReward, studentReward, validatorReward);
        emit ParametersUpdated(
            teacherReward,
            studentReward,
            validatorReward,
            committeeSize,
            validatorStake,
            targetSuccessRateBps,
            teacherRewardSplitBps,
            studentRewardSplitBps,
            validatorRewardSplitBps,
            address(feePool)
        );
    }

    /// @notice Update validator committee size and minimum stake signal.
    function setCommitteeParameters(uint256 committeeSize_, uint256 validatorStake_)
        external
        onlyOwner
    {
        if (committeeSize_ == 0 || validatorStake_ == 0) {
            revert ZeroValue();
        }
        committeeSize = committeeSize_;
        validatorStake = validatorStake_;
        emit CommitteeParametersUpdated(committeeSize_, validatorStake_);
        emit ParametersUpdated(
            baseTeacherReward,
            baseStudentReward,
            baseValidatorReward,
            committeeSize_,
            validatorStake_,
            targetSuccessRateBps,
            teacherRewardSplitBps,
            studentRewardSplitBps,
            validatorRewardSplitBps,
            address(feePool)
        );
    }

    /// @notice Update the target success rate used for adaptive difficulty.
    function setTargetSuccessRateBps(uint256 targetSuccessRateBps_) external onlyOwner {
        if (targetSuccessRateBps_ == 0 || targetSuccessRateBps_ > 10_000) {
            revert ZeroValue();
        }
        targetSuccessRateBps = targetSuccessRateBps_;
        emit TargetSuccessRateUpdated(targetSuccessRateBps_);
        emit ParametersUpdated(
            baseTeacherReward,
            baseStudentReward,
            baseValidatorReward,
            committeeSize,
            validatorStake,
            targetSuccessRateBps_,
            teacherRewardSplitBps,
            studentRewardSplitBps,
            validatorRewardSplitBps,
            address(feePool)
        );
    }

    /// @notice Update the basis point multipliers applied to base rewards.
    function setRewardSplits(uint16 teacherSplitBps, uint16 studentSplitBps, uint16 validatorSplitBps)
        external
        onlyOwner
    {
        uint256 total = uint256(teacherSplitBps) + uint256(studentSplitBps) + uint256(validatorSplitBps);
        if (total == 0 || total > _BPS_DENOMINATOR) {
            revert InvalidSplit();
        }
        teacherRewardSplitBps = teacherSplitBps;
        studentRewardSplitBps = studentSplitBps;
        validatorRewardSplitBps = validatorSplitBps;
        emit RewardSplitsUpdated(teacherSplitBps, studentSplitBps, validatorSplitBps);
        emit ParametersUpdated(
            baseTeacherReward,
            baseStudentReward,
            baseValidatorReward,
            committeeSize,
            validatorStake,
            targetSuccessRateBps,
            teacherSplitBps,
            studentSplitBps,
            validatorSplitBps,
            address(feePool)
        );
    }

    /// @notice Pause round lifecycle operations.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume round lifecycle operations.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Start a new self-play round.
    function startRound(
        uint32 difficulty,
        uint256 teacherJobId,
        address teacher,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external whenNotPaused onlyOperator nonReentrant returns (uint256 roundId) {
        _assertAgent(teacher, subdomain, proof);
        _assertJobExists(teacherJobId);

        roundId = ++_roundIdCounter;
        Round storage round = _rounds[roundId];
        round.difficulty = difficulty;
        round.startedAt = uint64(block.timestamp);
        round.teacherJobId = teacherJobId;
        round.teacher = teacher;

        emit RoundStarted(roundId, difficulty, teacherJobId, teacher, subdomain);
    }

    /// @notice Register a student job for an in-flight round.
    function registerStudentJob(
        uint256 roundId,
        uint256 jobId,
        address student,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external whenNotPaused onlyOperator {
        Round storage round = _requireRound(roundId);
        if (round.closedAt != 0) {
            revert RoundClosedAlready(roundId);
        }
        _assertAgent(student, subdomain, proof);
        _assertJobExists(jobId);
        _ensureUnique(round.students, student);

        round.studentJobIds.push(jobId);
        round.students.push(student);

        emit StudentRegistered(roundId, jobId, student, subdomain);
    }

    /// @notice Register a validator job for an in-flight round.
    function registerValidatorJob(
        uint256 roundId,
        uint256 jobId,
        address validator,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external whenNotPaused onlyOperator {
        Round storage round = _requireRound(roundId);
        if (round.closedAt != 0) {
            revert RoundClosedAlready(roundId);
        }
        if (round.validators.length >= committeeSize) {
            revert CommitteeFull(roundId);
        }
        _assertValidator(validator, subdomain, proof);
        _assertJobExists(jobId);
        _ensureUnique(round.validators, validator);

        round.validatorJobIds.push(jobId);
        round.validators.push(validator);

        emit ValidatorRegistered(roundId, jobId, validator, subdomain);
    }

    /// @notice Prevent additional registrations and mark the round as closed.
    function closeRound(uint256 roundId) external whenNotPaused onlyOperator {
        Round storage round = _requireRound(roundId);
        if (round.closedAt != 0) {
            revert RoundClosedAlready(roundId);
        }
        round.closedAt = uint64(block.timestamp);
        emit RoundClosed(roundId, round.closedAt);
    }

    /// @notice Finalise a round with outcome winners and difficulty delta.
    function finaliseRound(
        uint256 roundId,
        address[] calldata winners,
        int32 difficultyDelta
    ) external whenNotPaused onlyOperator nonReentrant {
        Round storage round = _requireRound(roundId);
        if (round.closedAt == 0) {
            revert RoundNotClosed(roundId);
        }
        if (round.finalised) {
            revert RoundFinalisedAlready(roundId);
        }
        round.finalised = true;
        round.difficultyDelta = difficultyDelta;
        uint256 length = winners.length;
        for (uint256 i; i < length; ++i) {
            round.winners.push(winners[i]);
        }
        emit RoundFinalised(roundId, winners, difficultyDelta);
        _distributeRewards(roundId, round, winners);
    }

    /// @notice Slash a validator involved in a round for misbehaviour.
    /// @dev The arena must be configured as an authorised validator slasher in StakeManager.
    function reportValidatorMisconduct(
        uint256 roundId,
        address validator,
        uint256 amount,
        address recipient,
        string calldata reason
    ) external whenNotPaused onlyOperator nonReentrant {
        if (amount == 0) {
            revert InvalidAmount();
        }
        if (recipient == address(0)) {
            revert ZeroAddress();
        }
        Round storage round = _requireRound(roundId);
        if (!_contains(round.validators, validator)) {
            revert InvalidValidator(validator);
        }
        IStakeManager manager = stakeManager;
        if (address(manager) == address(0)) {
            revert StakeManagerNotConfigured();
        }
        manager.slash(validator, amount, recipient);
        emit ValidatorMisconduct(roundId, validator, amount, recipient, reason);
    }

    function _distributeRewards(
        uint256 roundId,
        Round storage round,
        address[] calldata winners
    ) internal {
        IFeePool pool = feePool;
        if (address(pool) == address(0)) {
            revert FeePoolNotConfigured();
        }
        uint256 teacherReward = (baseTeacherReward * teacherRewardSplitBps) / _BPS_DENOMINATOR;
        uint256 studentReward = (baseStudentReward * studentRewardSplitBps) / _BPS_DENOMINATOR;
        uint256 validatorReward = (baseValidatorReward * validatorRewardSplitBps) / _BPS_DENOMINATOR;

        uint256 totalStudentPayout;
        uint256 totalValidatorPayout;

        if (teacherReward > 0 && round.teacher != address(0)) {
            pool.reward(round.teacher, teacherReward);
        }

        uint256 studentLength = round.students.length;
        for (uint256 i; i < studentLength; ++i) {
            if (studentReward == 0) {
                break;
            }
            address student = round.students[i];
            pool.reward(student, studentReward);
            totalStudentPayout += studentReward;
        }

        uint256 winnerLength = winners.length;
        for (uint256 i; i < winnerLength; ++i) {
            if (validatorReward == 0) {
                break;
            }
            address winner = winners[i];
            pool.reward(winner, validatorReward);
            totalValidatorPayout += validatorReward;
        }

        emit RewardsDistributed(roundId, teacherReward, totalStudentPayout, totalValidatorPayout);
    }

    /// @notice Retrieve round data including dynamic arrays in memory.
    function getRound(uint256 roundId) external view returns (RoundView memory viewRound) {
        Round storage round = _requireRound(roundId);
        viewRound.id = roundId;
        viewRound.difficulty = round.difficulty;
        viewRound.startedAt = round.startedAt;
        viewRound.closedAt = round.closedAt;
        viewRound.finalised = round.finalised;
        viewRound.teacherJobId = round.teacherJobId;
        viewRound.teacher = round.teacher;
        viewRound.difficultyDelta = round.difficultyDelta;
        viewRound.studentJobIds = _copyUintArray(round.studentJobIds);
        viewRound.students = _copyAddressArray(round.students);
        viewRound.validatorJobIds = _copyUintArray(round.validatorJobIds);
        viewRound.validators = _copyAddressArray(round.validators);
        viewRound.winners = _copyAddressArray(round.winners);
    }

    /// @notice Total number of rounds ever started.
    function totalRounds() external view returns (uint256) {
        return _roundIdCounter;
    }

    function _assertAgent(address account, string calldata subdomain, bytes32[] calldata proof) internal view {
        if (account == address(0)) {
            revert InvalidAgent(account);
        }
        if (account == owner()) {
            return;
        }
        IIdentityRegistry registry = identityRegistry;
        if (address(registry) == address(0)) {
            revert IdentityRegistryNotSet();
        }
        if (bytes(subdomain).length == 0) {
            revert InvalidAgent(account);
        }
        if (!registry.isAuthorizedAgent(account, subdomain, proof)) {
            revert InvalidAgent(account);
        }
    }

    function _assertValidator(address account, string calldata subdomain, bytes32[] calldata proof)
        internal
        view
    {
        if (account == address(0)) {
            revert InvalidValidator(account);
        }
        if (account == owner()) {
            return;
        }
        IIdentityRegistry registry = identityRegistry;
        if (address(registry) == address(0)) {
            revert IdentityRegistryNotSet();
        }
        if (bytes(subdomain).length == 0) {
            revert InvalidValidator(account);
        }
        if (!registry.isAuthorizedValidator(account, subdomain, proof)) {
            revert InvalidValidator(account);
        }
    }

    function _assertJobExists(uint256 jobId) internal view {
        if (jobId == 0) {
            revert InvalidJob(jobId);
        }
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        if (job.employer == address(0)) {
            revert InvalidJob(jobId);
        }
    }

    function _requireRound(uint256 roundId) internal view returns (Round storage round) {
        round = _rounds[roundId];
        if (round.startedAt == 0) {
            revert RoundNotFound(roundId);
        }
    }

    function _ensureUnique(address[] storage list, address candidate) internal view {
        uint256 length = list.length;
        for (uint256 i; i < length; ++i) {
            if (list[i] == candidate) {
                revert DuplicateParticipant(candidate);
            }
        }
    }

    function _contains(address[] storage list, address candidate) internal view returns (bool) {
        uint256 length = list.length;
        for (uint256 i; i < length; ++i) {
            if (list[i] == candidate) {
                return true;
            }
        }
        return false;
    }

    function _copyUintArray(uint256[] storage source) internal view returns (uint256[] memory copy) {
        uint256 length = source.length;
        copy = new uint256[](length);
        for (uint256 i; i < length; ++i) {
            copy[i] = source[i];
        }
    }

    function _copyAddressArray(address[] storage source) internal view returns (address[] memory copy) {
        uint256 length = source.length;
        copy = new address[](length);
        for (uint256 i; i < length; ++i) {
            copy[i] = source[i];
        }
    }
}
