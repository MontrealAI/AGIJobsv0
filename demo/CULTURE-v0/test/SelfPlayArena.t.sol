// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SelfPlayArena, IStakeManager} from "../contracts/SelfPlayArena.sol";

contract MockStakeManager is IStakeManager {
    struct SlashCall {
        address validator;
        uint256 amount;
        address recipient;
    }

    SlashCall[] public slashCalls;

    function slash(address user, uint256 amount, address recipient) external override {
        slashCalls.push(SlashCall({validator: user, amount: amount, recipient: recipient}));
    }

    function callsLength() external view returns (uint256) {
        return slashCalls.length;
    }
}

contract SelfPlayArenaTest is Test {
    SelfPlayArena internal arena;
    MockStakeManager internal stakeManager;

    address internal constant OWNER = address(0xA11CE);
    address internal constant ORCHESTRATOR = address(0x0C0FFEE);
    address internal constant TEACHER = address(0x1000);
    address internal constant STUDENT = address(0x2000);
    address internal constant VALIDATOR_ONE = address(0x3000);
    address internal constant VALIDATOR_TWO = address(0x3001);

    function setUp() public {
        stakeManager = new MockStakeManager();
        arena = new SelfPlayArena(OWNER, ORCHESTRATOR, address(stakeManager));
    }

    function testNormalRoundFlow() public {
        vm.prank(ORCHESTRATOR);
        uint256 roundId = arena.startRound({teacherJobId: 1, teacher: TEACHER, difficulty: 5});

        vm.prank(OWNER);
        arena.registerStudentJob(roundId, 10, STUDENT);

        vm.prank(ORCHESTRATOR);
        arena.registerValidatorJob(roundId, 20, VALIDATOR_ONE);

        vm.prank(OWNER);
        arena.closeRound(roundId);

        uint64 finalTimestamp = uint64(block.timestamp + 1);
        vm.warp(finalTimestamp);
        vm.expectEmit(true, false, false, true, address(arena));
        emit SelfPlayArena.RoundFinalized(roundId, 5, 1, 6, finalTimestamp);
        vm.prank(ORCHESTRATOR);
        arena.finalizeRound(roundId, 1, new address[](0), 0, address(0));

        SelfPlayArena.RoundView memory viewRound = arena.getRound(roundId);
        assertEq(viewRound.teacher, TEACHER);
        assertEq(viewRound.teacherJobId, 1);
        assertEq(viewRound.difficulty, 6);
        assertEq(viewRound.difficultyDelta, 1);
        assertTrue(viewRound.closed);
        assertTrue(viewRound.finalized);
        assertEq(viewRound.students.length, 1);
        assertEq(viewRound.studentJobIds[0], 10);
        assertEq(viewRound.validators.length, 1);
        assertEq(viewRound.validatorJobIds[0], 20);
    }

    function testUnauthorizedCallsRevert() public {
        vm.expectRevert(SelfPlayArena.Unauthorized.selector);
        arena.startRound({teacherJobId: 1, teacher: TEACHER, difficulty: 1});

        vm.prank(ORCHESTRATOR);
        uint256 roundId = arena.startRound({teacherJobId: 2, teacher: TEACHER, difficulty: 3});

        vm.expectRevert(SelfPlayArena.Unauthorized.selector);
        arena.closeRound(roundId);
    }

    function testPausedStateBlocksMutations() public {
        vm.prank(OWNER);
        arena.pause();

        vm.prank(ORCHESTRATOR);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        arena.startRound({teacherJobId: 1, teacher: TEACHER, difficulty: 2});
    }

    function testAbortRoundPreventsFinalization() public {
        vm.prank(ORCHESTRATOR);
        uint256 roundId = arena.startRound({teacherJobId: 7, teacher: TEACHER, difficulty: 4});

        vm.prank(OWNER);
        arena.registerStudentJob(roundId, 30, STUDENT);

        vm.prank(OWNER);
        arena.abortRound(roundId);

        SelfPlayArena.RoundView memory viewRound = arena.getRound(roundId);
        assertTrue(viewRound.aborted);
        assertTrue(viewRound.closed);
        assertEq(viewRound.abortedAt, viewRound.closedAt);

        vm.prank(ORCHESTRATOR);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.RoundIsAborted.selector, roundId));
        arena.finalizeRound(roundId, 1, new address[](0), 0, address(0));
    }

    function testValidatorSlashingDuringFinalize() public {
        vm.prank(ORCHESTRATOR);
        uint256 roundId = arena.startRound({teacherJobId: 11, teacher: TEACHER, difficulty: 8});

        vm.prank(ORCHESTRATOR);
        arena.registerValidatorJob(roundId, 41, VALIDATOR_ONE);
        vm.prank(OWNER);
        arena.registerValidatorJob(roundId, 42, VALIDATOR_TWO);

        vm.prank(OWNER);
        arena.closeRound(roundId);

        address[] memory offenders = new address[](2);
        offenders[0] = VALIDATOR_ONE;
        offenders[1] = VALIDATOR_TWO;

        vm.warp(block.timestamp + 5);
        vm.prank(ORCHESTRATOR);
        arena.finalizeRound(roundId, -2, offenders, 1 ether, OWNER);

        assertEq(stakeManager.callsLength(), 2);

        (address validator0, uint256 amount0, address recipient0) = stakeManager.slashCalls(0);
        assertEq(validator0, VALIDATOR_ONE);
        assertEq(amount0, 1 ether);
        assertEq(recipient0, OWNER);

        (address validator1, uint256 amount1, address recipient1) = stakeManager.slashCalls(1);
        assertEq(validator1, VALIDATOR_TWO);
        assertEq(amount1, 1 ether);
        assertEq(recipient1, OWNER);

        SelfPlayArena.RoundView memory viewRound = arena.getRound(roundId);
        assertEq(viewRound.difficulty, 6);
        assertEq(viewRound.difficultyDelta, -2);
        assertTrue(viewRound.finalized);
    }
}
