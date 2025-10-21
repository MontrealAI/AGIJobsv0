// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {SelfPlayArena, IIdentityRegistry} from "../contracts/SelfPlayArena.sol";

contract MockIdentityRegistry is IIdentityRegistry {
    mapping(bytes32 => mapping(address => bool)) public roles;

    function setRole(bytes32 role, address account, bool allowed) external {
        roles[role][account] = allowed;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return roles[role][account];
    }
}

contract SelfPlayArenaTest is Test {
    bytes32 internal constant TEACHER_ROLE = keccak256("TEACHER_ROLE");
    bytes32 internal constant STUDENT_ROLE = keccak256("STUDENT_ROLE");
    bytes32 internal constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    SelfPlayArena internal arena;
    MockIdentityRegistry internal identity;

    address internal owner = address(0xA11CE);
    address internal orchestrator = address(0x0c0ffee);
    address internal teacher = address(0x1000001);
    address internal student = address(0x2000002);
    address internal validator = address(0x3000003);

    function setUp() public {
        identity = new MockIdentityRegistry();
        identity.setRole(TEACHER_ROLE, teacher, true);
        identity.setRole(STUDENT_ROLE, student, true);
        identity.setRole(VALIDATOR_ROLE, validator, true);

        arena = new SelfPlayArena(
            owner,
            address(identity),
            1 ether,
            0.5 ether,
            0.2 ether,
            3,
            1 ether,
            6000
        );

        vm.prank(owner);
        arena.setOrchestrator(orchestrator, true);
    }

    function testStartRoundRegistersTeacher() public {
        vm.prank(orchestrator);
        uint256 roundId = arena.startRound(3, 101, teacher);
        assertEq(roundId, 1);

        SelfPlayArena.RoundView memory round = arena.getRound(roundId);
        assertEq(round.teacher, teacher);
        assertEq(round.teacherJobId, 101);
        assertEq(round.difficulty, 3);
    }

    function testRegisterStudentAndFinalize() public {
        vm.prank(orchestrator);
        uint256 roundId = arena.startRound(2, 111, teacher);

        vm.prank(orchestrator);
        arena.registerStudentJob(roundId, 201, student);

        vm.prank(orchestrator);
        arena.registerValidatorJob(roundId, 301, validator);

        vm.prank(orchestrator);
        arena.closeRound(roundId);

        address[] memory winners = new address[](1);
        winners[0] = student;

        vm.prank(orchestrator);
        arena.finalizeRound(roundId, winners, 1);

        SelfPlayArena.RoundView memory round = arena.getRound(roundId);
        assertTrue(round.finalized);
        assertEq(round.winners.length, 1);
        assertEq(round.winners[0], student);
        assertEq(round.difficultyDelta, 1);
    }

    function testDuplicateStudentRejected() public {
        vm.prank(orchestrator);
        uint256 roundId = arena.startRound(1, 55, teacher);

        vm.prank(orchestrator);
        arena.registerStudentJob(roundId, 200, student);

        vm.expectRevert(SelfPlayArena.DuplicateParticipant.selector);
        vm.prank(orchestrator);
        arena.registerStudentJob(roundId, 201, student);
    }

    function testFinalizeBeforeCloseReverts() public {
        vm.prank(orchestrator);
        uint256 roundId = arena.startRound(5, 77, teacher);

        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.RoundNotClosed.selector, roundId));
        vm.prank(orchestrator);
        arena.finalizeRound(roundId, new address[](0), 0);
    }
}
