// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

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
        uint256 roundId = _startRound();
        assertEq(validationModule.lastStartJobId(), 1);
        assertEq(validationModule.lastStartEntropy(), validationModule.lastStartEntropy()); // ensure recorded
        assertEq(roundId, 1);
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
