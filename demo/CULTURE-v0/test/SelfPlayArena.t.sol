// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SelfPlayArena, IStakeManager, IIdentityRegistry} from "../contracts/SelfPlayArena.sol";

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

contract MockIdentityRegistry is IIdentityRegistry {
    mapping(bytes32 => mapping(address => bool)) private _roles;

    function hasRole(bytes32 role, address account) external view override returns (bool) {
        return _roles[role][account];
    }

    function setRole(bytes32 role, address account, bool allowed) external {
        _roles[role][account] = allowed;
    }
}

contract SelfPlayArenaTest is Test {
    SelfPlayArena internal arena;
    MockStakeManager internal stakeManager;
    MockIdentityRegistry internal registry;

    address internal constant OWNER = address(0xA11CE);
    address internal constant RELAYER = address(0x0C0FFEE);
    address internal constant TEACHER = address(0x1000);
    address internal constant STUDENT = address(0x2000);
    address internal constant VALIDATOR_ONE = address(0x3000);
    address internal constant VALIDATOR_TWO = address(0x3001);

    bytes32 internal constant TEACHER_ROLE = keccak256("TEACHER_ROLE");
    bytes32 internal constant STUDENT_ROLE = keccak256("STUDENT_ROLE");
    bytes32 internal constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

    function setUp() public {
        stakeManager = new MockStakeManager();
        registry = new MockIdentityRegistry();
        registry.setRole(TEACHER_ROLE, TEACHER, true);
        registry.setRole(STUDENT_ROLE, STUDENT, true);
        registry.setRole(VALIDATOR_ROLE, VALIDATOR_ONE, true);
        registry.setRole(VALIDATOR_ROLE, VALIDATOR_TWO, true);

        arena = new SelfPlayArena(
            OWNER,
            RELAYER,
            address(registry),
            address(stakeManager),
            4,
            1 ether,
            7_500,
            5
        );
    }

    function _startRound() internal returns (uint256 roundId) {
        vm.prank(RELAYER);
        roundId = arena.startRound({teacherJobId: 1, teacher: TEACHER, difficulty: 3});
    }

    function _registerBaselineParticipants(uint256 roundId) internal {
        vm.prank(RELAYER);
        arena.registerParticipant(roundId, SelfPlayArena.ParticipantKind.Student, 10, STUDENT);

        vm.prank(RELAYER);
        arena.registerParticipant(roundId, SelfPlayArena.ParticipantKind.Validator, 20, VALIDATOR_ONE);

        vm.prank(OWNER);
        arena.registerParticipant(roundId, SelfPlayArena.ParticipantKind.Validator, 21, VALIDATOR_TWO);
    }

    function testRoundLifecycleHappyPath() public {
        uint256 roundId = _startRound();
        _registerBaselineParticipants(roundId);

        vm.prank(OWNER);
        arena.closeRound(roundId);

        vm.warp(block.timestamp + 1);
        vm.expectEmit(true, false, false, true, address(arena));
        emit SelfPlayArena.RoundFinalized(roundId, 3, 2, 5, 8_000, 2 ether, 77, uint64(block.timestamp));

        vm.prank(RELAYER);
        arena.finalizeRound(roundId, 2, 8_000, 2 ether, 77);

        SelfPlayArena.RoundView memory viewRound = arena.getRound(roundId);
        assertEq(viewRound.teacher, TEACHER);
        assertEq(viewRound.teacherJobId, 1);
        assertEq(viewRound.difficulty, 5);
        assertEq(viewRound.difficultyDelta, 2);
        assertEq(viewRound.observedSuccessRateBps, 8_000);
        assertEq(viewRound.rewardsDistributed, 2 ether);
        assertEq(viewRound.eloEventId, 77);
        assertTrue(viewRound.closed);
        assertTrue(viewRound.finalized);
        assertEq(viewRound.students.length, 1);
        assertEq(viewRound.validators.length, 2);
    }

    function testUnauthorizedAccessReverts() public {
        vm.expectRevert(SelfPlayArena.Unauthorized.selector);
        arena.startRound({teacherJobId: 1, teacher: TEACHER, difficulty: 1});

        uint256 roundId = _startRound();
        vm.expectRevert(SelfPlayArena.Unauthorized.selector);
        arena.closeRound(roundId);
    }

    function testPausingBlocksStateTransitions() public {
        vm.prank(OWNER);
        arena.pause();

        vm.prank(RELAYER);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        arena.startRound({teacherJobId: 1, teacher: TEACHER, difficulty: 2});
    }

    function testFinalizeRequiresSubmissions() public {
        uint256 roundId = _startRound();
        vm.prank(OWNER);
        arena.closeRound(roundId);

        vm.prank(RELAYER);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.MissingSubmissions.selector, roundId));
        arena.finalizeRound(roundId, 1, 7_000, 2 ether, 11);
    }

    function testValidatorMisconductReportsSlash() public {
        uint256 roundId = _startRound();
        _registerBaselineParticipants(roundId);
        vm.prank(OWNER);
        arena.closeRound(roundId);

        vm.prank(RELAYER);
        arena.reportValidatorMisconduct(roundId, VALIDATOR_ONE, 3 ether, OWNER, "late reveal");

        assertEq(stakeManager.callsLength(), 1);
        (address validator, uint256 amount, address recipient) = stakeManager.slashCalls(0);
        assertEq(validator, VALIDATOR_ONE);
        assertEq(amount, 3 ether);
        assertEq(recipient, OWNER);
    }

    function testRandomisedOperationSequence() public {
        uint256 roundId = _startRound();

        for (uint256 i = 0; i < 4; i++) {
            address student = address(uint160(0x5000 + i));
            registry.setRole(STUDENT_ROLE, student, true);
            vm.prank(i % 2 == 0 ? RELAYER : OWNER);
            arena.registerParticipant(roundId, SelfPlayArena.ParticipantKind.Student, 100 + i, student);
        }

        for (uint256 i = 0; i < 3; i++) {
            address validator = address(uint160(0x6000 + i));
            registry.setRole(VALIDATOR_ROLE, validator, true);
            vm.prank(i % 2 == 0 ? OWNER : RELAYER);
            arena.registerParticipant(roundId, SelfPlayArena.ParticipantKind.Validator, 200 + i, validator);
        }

        vm.prank(OWNER);
        arena.closeRound(roundId);

        uint32 observed = uint32(6_500 + uint32(bound(uint256(keccak256("seed")), 0, 3_500)));
        vm.prank(RELAYER);
        arena.finalizeRound(roundId, -3, observed, 4 ether, 13);

        SelfPlayArena.RoundView memory viewRound = arena.getRound(roundId);
        assertEq(viewRound.students.length, 4);
        assertEq(viewRound.validators.length, 3);
        assertEq(viewRound.difficulty, 0); // original 3 + (-3)
        assertEq(viewRound.rewardsDistributed, 4 ether);
        assertEq(viewRound.eloEventId, 13);
    }
}
