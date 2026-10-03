// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {SelfPlayArena, IIdentityRegistry} from "../contracts/SelfPlayArena.sol";
import {MockJobRegistry} from "../contracts/test/MockJobRegistry.sol";
import {MockStakeManager} from "../contracts/test/MockStakeManager.sol";
import {MockValidationModule} from "../contracts/test/MockValidationModule.sol";

contract ArenaIdentityRegistry is IIdentityRegistry {
    mapping(bytes32 => mapping(address => bool)) internal _roles;

    function setRole(bytes32 role, address account, bool allowed) external {
        _roles[role][account] = allowed;
    }

    function hasRole(bytes32 role, address account) external view override returns (bool) {
        return _roles[role][account];
    }
}

contract SelfPlayArenaTest is Test {
    SelfPlayArena internal arena;
    ArenaIdentityRegistry internal identity;
    MockJobRegistry internal jobRegistry;
    MockStakeManager internal stakeManager;
    MockValidationModule internal validationModule;

    address internal constant OWNER = address(0xA11CE);
    address internal constant RELAYER = address(0x0C0FFEE);
    address internal constant TEACHER = address(0x1000);
    address internal constant STUDENT = address(0x2000);
    address internal constant VALIDATOR_ONE = address(0x3000);
    address internal constant VALIDATOR_TWO = address(0x3001);
    address internal constant EMPLOYER = address(0x4000);

    bytes32 internal constant TEACHER_ROLE = keccak256("TEACHER_ROLE");
    bytes32 internal constant STUDENT_ROLE = keccak256("STUDENT_ROLE");
    bytes32 internal constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

    function setUp() public {
        identity = new ArenaIdentityRegistry();
        jobRegistry = new MockJobRegistry();
        stakeManager = new MockStakeManager();
        validationModule = new MockValidationModule();

        identity.setRole(TEACHER_ROLE, TEACHER, true);
        identity.setRole(STUDENT_ROLE, STUDENT, true);
        identity.setRole(VALIDATOR_ROLE, VALIDATOR_ONE, true);
        identity.setRole(VALIDATOR_ROLE, VALIDATOR_TWO, true);

        jobRegistry.setJob(1, EMPLOYER, TEACHER);
        jobRegistry.setJob(10, EMPLOYER, STUDENT);
        jobRegistry.setJob(20, EMPLOYER, VALIDATOR_ONE);
        jobRegistry.setJob(21, EMPLOYER, VALIDATOR_TWO);

        SelfPlayArena.RewardConfig memory rewards = SelfPlayArena.RewardConfig({
            teacher: 1 ether,
            student: 0.5 ether,
            validator: 0.25 ether
        });

        arena = new SelfPlayArena(
            OWNER,
            RELAYER,
            address(identity),
            address(jobRegistry),
            address(stakeManager),
            address(validationModule),
            4,
            2 ether,
            rewards,
            7_500,
            5
        );
    }

    function _startRound() internal returns (uint256 roundId) {
        vm.prank(RELAYER);
        roundId = arena.startRound({teacherJobId: 1, teacher: TEACHER, difficulty: 3});
    }

    function _registerParticipants(uint256 roundId) internal {
        vm.prank(RELAYER);
        arena.registerParticipant(roundId, SelfPlayArena.ParticipantKind.Student, 10, STUDENT);

        vm.prank(RELAYER);
        arena.registerParticipant(roundId, SelfPlayArena.ParticipantKind.Validator, 20, VALIDATOR_ONE);

        vm.prank(OWNER);
        arena.registerParticipant(roundId, SelfPlayArena.ParticipantKind.Validator, 21, VALIDATOR_TWO);
    }

    function testRoundLifecycleHappyPath() public {
        uint256 roundId = _startRound();
        _registerParticipants(roundId);

        vm.prank(OWNER);
        arena.closeRound(roundId);

        address[] memory winners = new address[](1);
        winners[0] = VALIDATOR_ONE;

        vm.expectEmit(true, false, false, true, address(arena));
        emit SelfPlayArena.RewardsDistributed(roundId, 1 ether, 0.5 ether, 0.25 ether);

        vm.prank(RELAYER);
        arena.finalizeRound(roundId, 2, 8_000, 42, false, winners);

        SelfPlayArena.RoundView memory viewRound = arena.getRound(roundId);
        assertEq(viewRound.teacher, TEACHER);
        assertEq(viewRound.teacherJobId, 1);
        assertEq(viewRound.difficulty, 5);
        assertEq(viewRound.difficultyDelta, 2);
        assertEq(viewRound.observedSuccessRateBps, 8_000);
        assertEq(viewRound.rewardsDistributed, 1 ether + 0.5 ether + 0.25 ether);
        assertEq(viewRound.eloEventId, 42);
        assertTrue(viewRound.validationPassed);
        assertEq(viewRound.winningValidators.length, 1);
        assertEq(viewRound.winningValidators[0], VALIDATOR_ONE);
    }

    function testFinalizeRevertsWhenValidationFails() public {
        uint256 roundId = _startRound();
        _registerParticipants(roundId);
        vm.prank(OWNER);
        arena.closeRound(roundId);

        validationModule.setFinalizeSuccess(false);

        vm.prank(RELAYER);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.ValidationFailed.selector, roundId, 1, false));
        arena.finalizeRound(roundId, 0, 7_500, 11, false, new address[](0));
    }

    function testForceFinalizeUsesForcePath() public {
        uint256 roundId = _startRound();
        _registerParticipants(roundId);
        vm.prank(OWNER);
        arena.closeRound(roundId);

        validationModule.setFinalizeSuccess(false);
        validationModule.setForceFinalizeSuccess(true);

        vm.prank(OWNER);
        arena.finalizeRound(roundId, 0, 7_500, 11, true, new address[](0));

        assertEq(validationModule.forceFinalizeCalls(), 1);
        assertTrue(arena.getRound(roundId).validationPassed);
    }

    function testRegisterParticipantRequiresJobMatch() public {
        uint256 roundId = _startRound();
        jobRegistry.setJob(50, EMPLOYER, TEACHER);
        identity.setRole(STUDENT_ROLE, address(0xBEEF), true);

        vm.prank(RELAYER);
        vm.expectRevert(
            abi.encodeWithSelector(SelfPlayArena.JobAgentMismatch.selector, 50, TEACHER, address(0xBEEF))
        );
        arena.registerParticipant(roundId, SelfPlayArena.ParticipantKind.Student, 50, address(0xBEEF));
    }

    function testValidatorMisconductReportsSlash() public {
        uint256 roundId = _startRound();
        _registerParticipants(roundId);
        vm.prank(OWNER);
        arena.closeRound(roundId);

        vm.prank(RELAYER);
        arena.reportValidatorMisconduct(roundId, VALIDATOR_ONE, 3 ether, OWNER, "late reveal");

        MockStakeManager.SlashCall memory slashCall = stakeManager.slashCalls(0);
        assertEq(slashCall.validator, VALIDATOR_ONE);
        assertEq(slashCall.amount, 3 ether);
        assertEq(slashCall.recipient, OWNER);
    }

    function testPausingBlocksStateTransitions() public {
        vm.prank(OWNER);
        arena.pause();

        vm.prank(RELAYER);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        arena.startRound({teacherJobId: 1, teacher: TEACHER, difficulty: 2});
    }

    function testRelayerAuthorizationFlow() public {
        address extraRelayer = address(0xB0B);
        vm.prank(OWNER);
        arena.setRelayerAuthorization(extraRelayer, true);

        vm.prank(extraRelayer);
        uint256 roundId = arena.startRound({teacherJobId: 1, teacher: TEACHER, difficulty: 1});
        assertEq(roundId, 1);

        vm.prank(OWNER);
        arena.setRelayerAuthorization(extraRelayer, false);
        vm.prank(extraRelayer);
        vm.expectRevert(SelfPlayArena.Unauthorized.selector);
        arena.closeRound(roundId);
    }

    function testValidationModuleStartCalled() public {
        uint256 expectedEntropy = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, uint256(1))));
        uint256 roundId = _startRound();
        assertEq(validationModule.lastStartJobId(), 1);
        assertEq(validationModule.lastStartEntropy(), expectedEntropy);
        assertEq(roundId, 1);
    }

    function testFinalizeRequiresSubmissions() public {
        uint256 id = _startRound();
        vm.startPrank(RELAYER);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.RoundNotClosed.selector, id));
        arena.finalizeRound(id, 0, 7_500, 1, false, new address[](0));
        arena.closeRound(id);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.MissingSubmissions.selector, id));
        arena.finalizeRound(id, 0, 7_500, 1, false, new address[](0));
        vm.stopPrank();
        assertFalse(arena.getRound(id).finalized);
    }

    function testUnauthorizedAccessReverts() public {
        uint256 id = _startRound();
        vm.startPrank(STUDENT);
        vm.expectRevert(SelfPlayArena.Unauthorized.selector);
        arena.startRound(1, TEACHER, 3);
        vm.expectRevert(SelfPlayArena.Unauthorized.selector);
        arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Student, 10, STUDENT);
        vm.expectRevert(SelfPlayArena.Unauthorized.selector);
        arena.closeRound(id);
        vm.expectRevert(SelfPlayArena.Unauthorized.selector);
        arena.finalizeRound(id, 0, 7_500, 1, true, new address[](0));
        vm.expectRevert(SelfPlayArena.Unauthorized.selector);
        arena.reportValidatorMisconduct(id, VALIDATOR_ONE, 1, OWNER, "unauthorized");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, STUDENT));
        arena.setRelayer(STUDENT);
        vm.stopPrank();
        assertEq(arena.totalRounds(), 1);
        assertFalse(arena.getRound(id).closed);
    }

    function testRandomisedOperationSequence() public {
        // A reproducible permutation; unconstrained reward counts are covered by the fuzz test.
        uint256 id = _startRound();
        vm.startPrank(RELAYER);
        uint256 seed = uint256(keccak256("culture-lifecycle-v2"));
        if (seed % 2 == 0) {
            arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Student, 10, STUDENT);
            arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Validator, 20, VALIDATOR_ONE);
        } else {
            arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Validator, 20, VALIDATOR_ONE);
            arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Student, 10, STUDENT);
        }
        arena.closeRound(id);
        arena.finalizeRound(id, -1, 6_000, 15, false, new address[](0));
        vm.stopPrank();
        SelfPlayArena.RoundView memory round = arena.getRound(id);
        assertTrue(round.finalized);
        assertEq(round.difficulty, 2);
        assertEq(round.rewardsDistributed, 1.75 ether);
        vm.prank(OWNER);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.RoundAlreadyFinalized.selector, id));
        arena.finalizeRound(id, 0, 6_000, 15, false, new address[](0));
        assertEq(validationModule.finalizeCalls(), 1);
    }

    function testOwnerConfigurationAndOwnershipHandoff() public {
        vm.startPrank(OWNER);
        arena.setRelayer(STUDENT);
        assertFalse(arena.hasRole(arena.RELAYER_ROLE(), RELAYER));
        assertTrue(arena.hasRole(arena.RELAYER_ROLE(), STUDENT));
        arena.setRelayer(address(0));
        assertFalse(arena.hasRole(arena.RELAYER_ROLE(), STUDENT));
        arena.setIdentityRegistry(address(identity));
        arena.setJobRegistry(address(jobRegistry));
        arena.setStakeManager(address(stakeManager));
        arena.setValidationModule(address(validationModule));
        arena.setCommitteeParameters(2, 3 ether);
        arena.setRewards(2 ether, 3 ether, 4 ether);
        assertEq(arena.baseTeacherReward(), 2 ether);
        assertEq(arena.baseStudentReward(), 3 ether);
        assertEq(arena.baseValidatorReward(), 4 ether);
        assertEq(arena.committeeSize(), 2);
        assertEq(arena.validatorStake(), 3 ether);
        arena.setTargetSuccessRateBps(8_000);
        arena.setMaxDifficultyStep(10);
        assertEq(arena.targetSuccessRateBps(), 8_000);
        assertEq(arena.maxDifficultyStep(), 10);
        assertTrue(arena.supportsInterface(0x01ffc9a7));
        assertFalse(arena.supportsInterface(0xffffffff));
        arena.pause();
        arena.unpause();
        arena.transferOwnership(EMPLOYER);
        vm.stopPrank();
        assertFalse(arena.hasRole(arena.DEFAULT_ADMIN_ROLE(), OWNER));
        assertTrue(arena.hasRole(arena.DEFAULT_ADMIN_ROLE(), EMPLOYER));
        vm.prank(OWNER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, OWNER));
        arena.setRelayer(RELAYER);
        vm.prank(EMPLOYER);
        arena.setRelayer(RELAYER);
    }

    function testInvalidConfigurationFailsWithoutChangingState() public {
        vm.startPrank(OWNER);
        vm.expectRevert(SelfPlayArena.InvalidAddress.selector);
        arena.setIdentityRegistry(address(0));
        vm.expectRevert(SelfPlayArena.InvalidAddress.selector);
        arena.setJobRegistry(address(0));
        vm.expectRevert(SelfPlayArena.InvalidAddress.selector);
        arena.setValidationModule(address(0));
        vm.expectRevert(SelfPlayArena.InvalidRewardConfig.selector);
        arena.setCommitteeParameters(0, 1);
        vm.expectRevert(SelfPlayArena.InvalidRewardConfig.selector);
        arena.setCommitteeParameters(1, 0);
        vm.expectRevert(SelfPlayArena.InvalidRewardConfig.selector);
        arena.setRewards(0, 1, 1);
        vm.expectRevert(SelfPlayArena.InvalidRewardConfig.selector);
        arena.setRewards(1, 0, 1);
        vm.expectRevert(SelfPlayArena.InvalidRewardConfig.selector);
        arena.setRewards(1, 1, 0);
        vm.expectRevert(SelfPlayArena.InvalidSuccessRate.selector);
        arena.setTargetSuccessRateBps(0);
        vm.expectRevert(SelfPlayArena.InvalidSuccessRate.selector);
        arena.setTargetSuccessRateBps(10_001);
        vm.expectRevert(SelfPlayArena.InvalidRewardConfig.selector);
        arena.setMaxDifficultyStep(0);
        vm.stopPrank();
        assertEq(arena.committeeSize(), 4);
        assertEq(address(arena.validationModule()), address(validationModule));
    }

    function testInvalidParticipantsAndClosedRounds() public {
        vm.startPrank(RELAYER);
        vm.expectRevert(SelfPlayArena.InvalidJobId.selector);
        arena.startRound(0, TEACHER, 3);
        vm.expectRevert(SelfPlayArena.InvalidAddress.selector);
        arena.startRound(1, address(0), 3);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.ParticipantNotAuthorized.selector, STUDENT, TEACHER_ROLE));
        arena.startRound(1, STUDENT, 3);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.JobAgentMismatch.selector, 10, STUDENT, TEACHER));
        arena.startRound(10, TEACHER, 3);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.RoundNotFound.selector, 99));
        arena.getRound(99);
        uint256 id = arena.startRound(1, TEACHER, 3);
        vm.expectRevert(SelfPlayArena.InvalidJobId.selector);
        arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Student, 0, STUDENT);
        vm.expectRevert(SelfPlayArena.InvalidAddress.selector);
        arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Student, 10, address(0));
        arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Student, 10, STUDENT);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.DuplicateParticipant.selector, STUDENT));
        arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Student, 10, STUDENT);
        arena.closeRound(id);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.RoundAlreadyClosed.selector, id));
        arena.closeRound(id);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.RoundAlreadyClosed.selector, id));
        arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Validator, 20, VALIDATOR_ONE);
        vm.stopPrank();
    }

    function testCommitteeLimitAndOwnerIdentityBypass() public {
        jobRegistry.setJob(2, EMPLOYER, OWNER);
        vm.startPrank(OWNER);
        arena.setCommitteeParameters(1, 1 ether);
        uint256 id = arena.startRound(2, OWNER, 1);
        arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Student, 10, STUDENT);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.CommitteeFull.selector, id));
        arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Student, 10, STUDENT);
        vm.stopPrank();
    }

    function testDifficultyAndWinnerValidationIsAtomic() public {
        uint256 id = _startRound();
        _registerParticipants(id);
        vm.startPrank(RELAYER);
        arena.closeRound(id);
        vm.expectRevert(SelfPlayArena.InvalidSuccessRate.selector);
        arena.finalizeRound(id, 0, 10_001, 1, false, new address[](0));
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.DifficultyStepExceeded.selector, int32(6), uint32(5)));
        arena.finalizeRound(id, 6, 7_500, 1, false, new address[](0));
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.DifficultyStepExceeded.selector, type(int32).min, uint32(5)));
        arena.finalizeRound(id, type(int32).min, 7_500, 1, false, new address[](0));
        vm.expectRevert(SelfPlayArena.InvalidDifficultyDelta.selector);
        arena.finalizeRound(id, -4, 7_500, 1, false, new address[](0));
        address[] memory winners = new address[](2);
        winners[0] = VALIDATOR_ONE;
        winners[1] = STUDENT;
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.UnknownWinner.selector, STUDENT));
        arena.finalizeRound(id, 0, 7_500, 1, false, winners);
        winners[1] = VALIDATOR_ONE;
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.DuplicateWinner.selector, VALIDATOR_ONE));
        arena.finalizeRound(id, 0, 7_500, 1, false, winners);
        vm.stopPrank();
        assertEq(validationModule.finalizeCalls(), 0);
        assertFalse(arena.getRound(id).finalized);
    }

    function testDifficultyFullSignedRange() public {
        vm.startPrank(OWNER);
        arena.setMaxDifficultyStep(type(uint32).max);
        uint256 id = arena.startRound(1, TEACHER, uint32(1) << 31);
        arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Student, 10, STUDENT);
        arena.closeRound(id);
        arena.finalizeRound(id, type(int32).min, 0, 1, false, new address[](0));
        assertEq(arena.getRound(id).difficulty, 0);
        id = arena.startRound(1, TEACHER, type(uint32).max);
        arena.registerParticipant(id, SelfPlayArena.ParticipantKind.Student, 10, STUDENT);
        arena.closeRound(id);
        vm.expectRevert(SelfPlayArena.InvalidDifficultyDelta.selector);
        arena.finalizeRound(id, 1, 10_000, 1, false, new address[](0));
        arena.finalizeRound(id, 0, 10_000, 1, false, new address[](0));
        assertEq(arena.getRound(id).difficulty, type(uint32).max);
        vm.stopPrank();
    }

    function testMisconductGuardsAndDisabledSlashing() public {
        uint256 id = _startRound();
        _registerParticipants(id);
        vm.startPrank(OWNER);
        vm.expectRevert(SelfPlayArena.InvalidSlashAmount.selector);
        arena.reportValidatorMisconduct(id, VALIDATOR_ONE, 0, OWNER, "zero");
        vm.expectRevert(SelfPlayArena.InvalidAddress.selector);
        arena.reportValidatorMisconduct(id, VALIDATOR_ONE, 1, address(0), "recipient");
        vm.expectRevert(SelfPlayArena.InvalidAddress.selector);
        arena.reportValidatorMisconduct(id, address(0), 1, OWNER, "validator");
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.ValidatorNotRegistered.selector, STUDENT));
        arena.reportValidatorMisconduct(id, STUDENT, 1, OWNER, "unknown");
        arena.setStakeManager(address(0));
        vm.expectRevert(SelfPlayArena.StakeManagerNotSet.selector);
        arena.reportValidatorMisconduct(id, VALIDATOR_ONE, 1, OWNER, "disabled");
        vm.stopPrank();
        assertEq(stakeManager.callsLength(), 0);
    }

    function testFuzzRewardDistribution(uint8 studentCount, uint8 validatorCount, uint8 winnerCount) public {
        vm.assume(studentCount > 0);
        uint256 roundId = _startRound();

        uint256 studentsToRegister = bound(uint256(studentCount), 1, 4);
        uint256 validatorsToRegister = bound(uint256(validatorCount), 1, 6);

        for (uint256 i = 0; i < studentsToRegister; i++) {
            address student = address(uint160(0x5000 + i));
            identity.setRole(STUDENT_ROLE, student, true);
            jobRegistry.setJob(100 + i, EMPLOYER, student);
            vm.prank(i % 2 == 0 ? RELAYER : OWNER);
            arena.registerParticipant(roundId, SelfPlayArena.ParticipantKind.Student, 100 + i, student);
        }

        address[] memory validators = new address[](validatorsToRegister);
        for (uint256 i = 0; i < validatorsToRegister; i++) {
            address validator = address(uint160(0x6000 + i));
            identity.setRole(VALIDATOR_ROLE, validator, true);
            jobRegistry.setJob(200 + i, EMPLOYER, validator);
            validators[i] = validator;
            vm.prank(i % 2 == 0 ? OWNER : RELAYER);
            arena.registerParticipant(roundId, SelfPlayArena.ParticipantKind.Validator, 200 + i, validator);
        }

        vm.prank(OWNER);
        arena.closeRound(roundId);

        uint256 winnersToSelect = bound(uint256(winnerCount), 0, validatorsToRegister);
        address[] memory winners = new address[](winnersToSelect);
        for (uint256 i = 0; i < winnersToSelect; i++) {
            winners[i] = validators[i];
        }

        vm.prank(RELAYER);
        arena.finalizeRound(roundId, 0, 6_500, 11, false, winners);

        SelfPlayArena.RoundView memory viewRound = arena.getRound(roundId);
        uint256 expectedStudents = studentsToRegister;
        uint256 expectedValidators = winnersToSelect == 0 ? validatorsToRegister : winnersToSelect;
        uint256 expectedTotal = 1 ether + (0.5 ether * expectedStudents) + (0.25 ether * expectedValidators);
        assertEq(viewRound.rewardsDistributed, expectedTotal);
    }

    function testForceFinalizeFailureReverts() public {
        uint256 roundId = _startRound();
        _registerParticipants(roundId);
        vm.prank(OWNER);
        arena.closeRound(roundId);

        validationModule.setFinalizeSuccess(false);
        validationModule.setForceFinalizeSuccess(false);

        vm.prank(RELAYER);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.ValidationFailed.selector, roundId, 1, true));
        arena.finalizeRound(roundId, 0, 7_500, 11, true, new address[](0));
    }
}
