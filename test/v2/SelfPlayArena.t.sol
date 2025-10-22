// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";

import {SelfPlayArena} from "../../contracts/v2/SelfPlayArena.sol";
import {IJobRegistry} from "../../contracts/v2/interfaces/IJobRegistry.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract MockIdentityRegistry {
    mapping(address => bool) public authorisedAgents;
    mapping(address => bool) public authorisedValidators;

    function setAgent(address account, bool allowed) external {
        authorisedAgents[account] = allowed;
    }

    function setValidator(address account, bool allowed) external {
        authorisedValidators[account] = allowed;
    }

    function isAuthorizedAgent(address account, string calldata, bytes32[] calldata) external view returns (bool) {
        return authorisedAgents[account];
    }

    function isAuthorizedValidator(address account, string calldata, bytes32[] calldata) external view returns (bool) {
        return authorisedValidators[account];
    }
}

contract MockJobRegistry {
    mapping(uint256 => IJobRegistry.Job) internal _jobs;

    function setJob(uint256 jobId, address employer, address agent) external {
        _jobs[jobId] = IJobRegistry.Job({
            employer: employer,
            agent: agent,
            reward: uint128(1),
            stake: uint96(1),
            burnReceiptAmount: uint128(0),
            uriHash: bytes32(0),
            resultHash: bytes32(0),
            specHash: bytes32(0),
            packedMetadata: 1
        });
    }

    function jobs(uint256 jobId) external view returns (IJobRegistry.Job memory) {
        return _jobs[jobId];
    }
}

contract MockStakeManager {
    mapping(address => uint256) public validatorStake;
    uint256 public lastSlashAmount;
    address public lastRecipient;

    function setStake(address validator, uint256 amount) external {
        validatorStake[validator] = amount;
    }

    function slash(address validator, uint256 amount, address recipient) external {
        if (amount > validatorStake[validator]) revert("stake");
        validatorStake[validator] -= amount;
        lastSlashAmount = amount;
        lastRecipient = recipient;
    }
}

contract MockFeePool {
    struct Payout {
        address to;
        uint256 amount;
    }

    Payout[] internal _payouts;

    function reward(address to, uint256 amount) external {
        _payouts.push(Payout({to: to, amount: amount}));
    }

    function payoutCount() external view returns (uint256) {
        return _payouts.length;
    }

    function payout(uint256 index) external view returns (Payout memory) {
        return _payouts[index];
    }
}

contract SelfPlayArenaTest is Test {
    MockIdentityRegistry internal identity;
    MockJobRegistry internal jobRegistry;
    MockStakeManager internal stakeManager;
    MockFeePool internal feePool;
    SelfPlayArena internal arena;

    address internal owner = address(this);
    address internal orchestrator = address(0xB0B);
    address internal teacher = address(0xA11CE);
    address internal student = address(0xC0DE);
    address internal validator = address(0xF00D);
    address internal employer = address(0xE1);

    string internal constant TEACHER_SUBDOMAIN = "teacher";
    string internal constant STUDENT_SUBDOMAIN = "student";
    string internal constant VALIDATOR_SUBDOMAIN = "validator";

    function setUp() public {
        identity = new MockIdentityRegistry();
        jobRegistry = new MockJobRegistry();
        stakeManager = new MockStakeManager();
        feePool = new MockFeePool();

        identity.setAgent(teacher, true);
        identity.setAgent(student, true);
        identity.setValidator(validator, true);

        jobRegistry.setJob(1, employer, teacher);
        jobRegistry.setJob(2, employer, student);
        jobRegistry.setJob(3, employer, validator);

        arena = new SelfPlayArena(
            owner,
            address(identity),
            address(jobRegistry),
            address(stakeManager),
            100 ether,
            50 ether,
            25 ether,
            3,
            1 ether,
            8_000
        );

        arena.setOrchestrator(orchestrator, true);
        arena.setFeePool(address(feePool));
    }

    function _startRound() internal returns (uint256 roundId) {
        vm.prank(orchestrator);
        roundId = arena.startRound(1, 1, teacher, TEACHER_SUBDOMAIN, new bytes32[](0));
    }

    function testRoundLifecycleHappyPath() public {
        uint256 roundId = _startRound();

        vm.prank(orchestrator);
        arena.registerStudentJob(roundId, 2, student, STUDENT_SUBDOMAIN, new bytes32[](0));

        vm.prank(orchestrator);
        arena.registerValidatorJob(roundId, 3, validator, VALIDATOR_SUBDOMAIN, new bytes32[](0));

        vm.prank(orchestrator);
        arena.closeRound(roundId);

        address[] memory winners = new address[](1);
        winners[0] = validator;
        vm.prank(orchestrator);
        arena.finaliseRound(roundId, winners, 1);

        SelfPlayArena.RoundView memory viewData = arena.getRound(roundId);
        assertEq(viewData.teacher, teacher);
        assertEq(viewData.students.length, 1);
        assertEq(viewData.validators.length, 1);
        assertEq(viewData.winners.length, 1);
        assertEq(viewData.finalised, true);
    }

    function testFinaliseDistributesRewards() public {
        uint256 roundId = _startRound();

        vm.prank(orchestrator);
        arena.registerStudentJob(roundId, 2, student, STUDENT_SUBDOMAIN, new bytes32[](0));

        vm.prank(orchestrator);
        arena.registerValidatorJob(roundId, 3, validator, VALIDATOR_SUBDOMAIN, new bytes32[](0));

        vm.prank(orchestrator);
        arena.closeRound(roundId);

        address[] memory winners = new address[](1);
        winners[0] = validator;

        vm.prank(orchestrator);
        vm.expectEmit(true, false, false, true);
        emit SelfPlayArena.RewardsDistributed(roundId, 100 ether, 50 ether, 25 ether);
        arena.finaliseRound(roundId, winners, 0);

        assertEq(feePool.payoutCount(), 3);
        MockFeePool.Payout memory teacherReward = feePool.payout(0);
        assertEq(teacherReward.to, teacher);
        assertEq(teacherReward.amount, 100 ether);
        MockFeePool.Payout memory studentReward = feePool.payout(1);
        assertEq(studentReward.to, student);
        assertEq(studentReward.amount, 50 ether);
        MockFeePool.Payout memory validatorReward = feePool.payout(2);
        assertEq(validatorReward.to, validator);
        assertEq(validatorReward.amount, 25 ether);
    }

    function testFinaliseRequiresFeePool() public {
        arena.setFeePool(address(0));
        uint256 roundId = _startRound();

        vm.prank(orchestrator);
        arena.registerValidatorJob(roundId, 3, validator, VALIDATOR_SUBDOMAIN, new bytes32[](0));

        vm.prank(orchestrator);
        arena.closeRound(roundId);

        address[] memory winners = new address[](1);
        winners[0] = validator;

        vm.prank(orchestrator);
        vm.expectRevert(SelfPlayArena.FeePoolNotConfigured.selector);
        arena.finaliseRound(roundId, winners, 0);
    }

    function testSetRewardSplitsEmitsParameters() public {
        vm.expectEmit(false, false, false, true);
        emit SelfPlayArena.RewardSplitsUpdated(5_000, 3_000, 2_000);
        arena.setRewardSplits(5_000, 3_000, 2_000);
        assertEq(arena.teacherRewardSplitBps(), 5_000);
        assertEq(arena.studentRewardSplitBps(), 3_000);
        assertEq(arena.validatorRewardSplitBps(), 2_000);
    }

    function testRewardSplitsScalePayouts() public {
        arena.setRewardSplits(5_000, 2_500, 2_500);

        uint256 roundId = _startRound();
        vm.prank(orchestrator);
        arena.registerStudentJob(roundId, 2, student, STUDENT_SUBDOMAIN, new bytes32[](0));
        vm.prank(orchestrator);
        arena.registerValidatorJob(roundId, 3, validator, VALIDATOR_SUBDOMAIN, new bytes32[](0));
        vm.prank(orchestrator);
        arena.closeRound(roundId);

        address[] memory winners = new address[](1);
        winners[0] = validator;

        vm.prank(orchestrator);
        arena.finaliseRound(roundId, winners, 0);

        assertEq(feePool.payoutCount(), 3);
        MockFeePool.Payout memory teacherReward = feePool.payout(0);
        assertEq(teacherReward.amount, 50 ether);
        MockFeePool.Payout memory studentReward = feePool.payout(1);
        assertEq(studentReward.amount, 12.5 ether);
        MockFeePool.Payout memory validatorReward = feePool.payout(2);
        assertEq(validatorReward.amount, 6.25 ether);
    }

    function testStartRoundRequiresIdentity() public {
        identity.setAgent(teacher, false);

        vm.prank(orchestrator);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.InvalidAgent.selector, teacher));
        arena.startRound(1, 1, teacher, TEACHER_SUBDOMAIN, new bytes32[](0));
    }

    function testRegisterStudentRejectsDuplicates() public {
        uint256 roundId = _startRound();

        vm.prank(orchestrator);
        arena.registerStudentJob(roundId, 2, student, STUDENT_SUBDOMAIN, new bytes32[](0));

        vm.prank(orchestrator);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.DuplicateParticipant.selector, student));
        arena.registerStudentJob(roundId, 2, student, STUDENT_SUBDOMAIN, new bytes32[](0));
    }

    function testRegisterValidatorRespectsCommitteeSize() public {
        arena.setCommitteeParameters(1, 1 ether);
        uint256 roundId = _startRound();

        vm.prank(orchestrator);
        arena.registerValidatorJob(roundId, 3, validator, VALIDATOR_SUBDOMAIN, new bytes32[](0));

        address validator2 = address(0xF00E);
        identity.setValidator(validator2, true);
        jobRegistry.setJob(4, employer, validator2);

        vm.prank(orchestrator);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.CommitteeFull.selector, roundId));
        arena.registerValidatorJob(roundId, 4, validator2, VALIDATOR_SUBDOMAIN, new bytes32[](0));
    }

    function testFinaliseRequiresClosedRound() public {
        uint256 roundId = _startRound();

        address[] memory winners;
        vm.prank(orchestrator);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.RoundNotClosed.selector, roundId));
        arena.finaliseRound(roundId, winners, 0);
    }

    function testReportValidatorMisconductSlashesStake() public {
        uint256 stakeAmount = 10 ether;
        stakeManager.setStake(validator, stakeAmount);

        uint256 roundId = _startRound();
        vm.prank(orchestrator);
        arena.registerValidatorJob(roundId, 3, validator, VALIDATOR_SUBDOMAIN, new bytes32[](0));

        vm.prank(orchestrator);
        arena.reportValidatorMisconduct(roundId, validator, 2 ether, owner, "slow reveal");

        assertEq(stakeManager.validatorStake(validator), stakeAmount - 2 ether);
        assertEq(stakeManager.lastRecipient(), owner);
        assertEq(stakeManager.lastSlashAmount(), 2 ether);
    }

    function testReportValidatorMisconductRequiresStakeManager() public {
        uint256 roundId = _startRound();
        vm.prank(orchestrator);
        arena.registerValidatorJob(roundId, 3, validator, VALIDATOR_SUBDOMAIN, new bytes32[](0));

        arena.setStakeManager(address(0));
        vm.prank(orchestrator);
        vm.expectRevert(SelfPlayArena.StakeManagerNotConfigured.selector);
        arena.reportValidatorMisconduct(roundId, validator, 1, owner, "missing manager");
    }

    function testPausePreventsStart() public {
        arena.pause();
        vm.prank(orchestrator);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        arena.startRound(1, 1, teacher, TEACHER_SUBDOMAIN, new bytes32[](0));
    }

    function testFuzzValidatorCannotRegisterTwice(address candidate) public {
        vm.assume(candidate != address(0));
        vm.assume(candidate != owner);
        identity.setValidator(candidate, true);
        jobRegistry.setJob(10, employer, candidate);

        uint256 roundId = _startRound();

        vm.prank(orchestrator);
        arena.registerValidatorJob(roundId, 10, candidate, VALIDATOR_SUBDOMAIN, new bytes32[](0));

        vm.prank(orchestrator);
        vm.expectRevert(abi.encodeWithSelector(SelfPlayArena.DuplicateParticipant.selector, candidate));
        arena.registerValidatorJob(roundId, 10, candidate, VALIDATOR_SUBDOMAIN, new bytes32[](0));
    }
}
