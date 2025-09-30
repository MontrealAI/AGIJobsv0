// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";

import {KernelStakeManager} from "../../../contracts/v2/kernel/StakeManager.sol";
import {EscrowVault} from "../../../contracts/v2/kernel/EscrowVault.sol";
import {KernelJobRegistry} from "../../../contracts/v2/kernel/JobRegistry.sol";
import {RewardEngine} from "../../../contracts/v2/kernel/RewardEngine.sol";
import {KernelConfig} from "../../../contracts/v2/kernel/Config.sol";
import {ValidationModule} from "../../../contracts/v2/kernel/ValidationModule.sol";
import {MockERC20} from "../../../contracts/test/MockERC20.sol";

contract KernelPipelineTest is Test {
    KernelStakeManager internal stakeManager;
    EscrowVault internal escrowVault;
    KernelJobRegistry internal jobRegistry;
    RewardEngine internal rewardEngine;
    KernelConfig internal config;
    ValidationModule internal validationModule;
    MockERC20 internal token;

    address internal governance = address(this);
    address internal opsTreasury = address(0x0A05);
    address internal employer = address(0xE);
    address internal agent = address(0xA);
    address[] internal validators;

    function setUp() public {
        token = new MockERC20();
        stakeManager = new KernelStakeManager(token, governance);
        escrowVault = new EscrowVault(token, governance);
        config = new KernelConfig(governance);
        rewardEngine = new RewardEngine(governance);
        validationModule = new ValidationModule(config, governance);
        jobRegistry = new KernelJobRegistry(
            stakeManager,
            escrowVault,
            rewardEngine,
            config,
            validationModule,
            governance,
            opsTreasury
        );

        validationModule.setJobRegistry(jobRegistry);
        escrowVault.setController(address(jobRegistry));
        stakeManager.setOperator(address(jobRegistry), true);

        validators = new address[](2);
        validators[0] = address(0xB1);
        validators[1] = address(0xB2);

        // Ensure validators count aligns with config expectations.
        config.setValidatorParams(2, 6_000);
        config.setNoRevealSlash(500); // 5%
        config.setMaliciousSlash(1_000); // 10%

        // Fund participants with stake.
        _stake(agent, 50 ether);
        _stake(validators[0], 20 ether);
        _stake(validators[1], 20 ether);

        // Fund employer with reward tokens and approve escrow vault.
        token.mint(employer, 200 ether);
        vm.prank(employer);
        token.approve(address(escrowVault), type(uint256).max);
    }

    function _stake(address participant, uint256 amount) internal {
        token.mint(participant, amount);
        vm.startPrank(participant);
        token.approve(address(stakeManager), amount);
        stakeManager.deposit(participant, amount);
        vm.stopPrank();
    }

    function _job(uint256 jobId) internal view returns (KernelJobRegistry.Job memory job) {
        (
            job.employer,
            job.agent,
            job.reward,
            job.deadline,
            job.submittedAt,
            job.submitted,
            job.finalized,
            job.success,
            job.specHash
        ) = jobRegistry.jobs(jobId);
    }

    function testCreateJobRevertsOnDuplicateValidators() public {
        address[] memory duplicateValidators = new address[](2);
        duplicateValidators[0] = validators[0];
        duplicateValidators[1] = validators[0];

        vm.expectRevert(KernelJobRegistry.InvalidValidators.selector);
        vm.prank(employer);
        jobRegistry.createJob(
            agent,
            duplicateValidators,
            60 ether,
            uint64(block.timestamp + 2 days),
            keccak256("duplicate-validators")
        );
    }

    function testCreateJobSucceedsWithUniqueValidatorsAfterDuplicateCheck() public {
        vm.prank(employer);
        uint256 jobId = jobRegistry.createJob(
            agent,
            validators,
            70 ether,
            uint64(block.timestamp + 2 days),
            keccak256("unique-validators")
        );

        assertEq(jobRegistry.nextJobId(), jobId + 1);
    }

    function testHappyPathValidationAndPayout() public {
        uint256 reward = 120 ether;
        uint64 deadline = uint64(block.timestamp + 3 days);
        bytes32 specHash = keccak256("job-spec");

        uint256 employerInitial = token.balanceOf(employer);
        vm.prank(employer);
        uint256 jobId = jobRegistry.createJob(agent, validators, reward, deadline, specHash);
        assertEq(jobRegistry.nextJobId(), jobId + 1);
        assertEq(escrowVault.balanceOf(jobId), reward);

        // Agent submits the result triggering validation windows.
        vm.prank(agent);
        jobRegistry.submitResult(jobId);

        // Validators commit approvals.
        bytes32[] memory salts = new bytes32[](validators.length);
        for (uint256 i = 0; i < validators.length; i++) {
            salts[i] = keccak256(abi.encodePacked("salt", i));
            bytes32 commitment = keccak256(abi.encodePacked(jobId, validators[i], true, salts[i]));
            vm.prank(validators[i]);
            validationModule.commit(jobId, commitment);
        }

        // Move past commit window to allow reveals.
        vm.warp(block.timestamp + config.commitWindow() + 1);

        for (uint256 i = 0; i < validators.length; i++) {
            vm.prank(validators[i]);
            validationModule.reveal(jobId, true, salts[i]);
        }

        validationModule.finalize(jobId);

        // Ensure job finalized successfully.
        (,,, uint64 deadlineStored,, bool finalized, bool success,,,) = jobRegistry.jobs(jobId);
        assertEq(deadlineStored, deadline);
        assertTrue(finalized);
        assertTrue(success);

        RewardEngine.SplitResult memory split = rewardEngine.split(jobId, reward);

        // Agent received split.
        assertEq(token.balanceOf(agent), split.agentAmount);

        // Validators share equally with rounding dust to first validator.
        uint256 expectedValidatorTotal = split.validatorAmount;
        uint256 base = expectedValidatorTotal / validators.length;
        uint256 remainder = expectedValidatorTotal - (base * validators.length);
        uint256 validatorOne = token.balanceOf(validators[0]);
        uint256 validatorTwo = token.balanceOf(validators[1]);
        assertEq(validatorOne, base + remainder);
        assertEq(validatorTwo, base);

        // Employer receives rebate plus any remainder from rounding.
        uint256 leftover = reward
            - (split.agentAmount + split.validatorAmount + split.opsAmount + split.employerRebateAmount + split.burnAmount);
        uint256 employerExpected = employerInitial - reward + split.employerRebateAmount + leftover;
        uint256 remainingEscrow = escrowVault.balanceOf(jobId);
        assertEq(remainingEscrow, 0);
        assertEq(token.balanceOf(employer), employerExpected);

        // Ops treasury receives allocation when configured.
        uint256 opsExpected = split.opsAmount;
        assertEq(token.balanceOf(opsTreasury), opsExpected);

        // Burn address receives burn amount.
        assertEq(token.balanceOf(escrowVault.BURN_ADDRESS()), split.burnAmount);
    }

    function testWithdrawalBlockedWhileJobActiveAndSlashApplies() public {
        uint256 reward = 60 ether;
        uint64 deadline = uint64(block.timestamp + 2 days);
        vm.prank(employer);
        uint256 jobId = jobRegistry.createJob(agent, validators, reward, deadline, keccak256("locked"));

        // Agent stake is locked for the job preventing full withdrawal.
        vm.prank(agent);
        vm.expectRevert(KernelStakeManager.InsufficientStake.selector);
        stakeManager.withdraw(agent, 50 ether);

        // Advance time past the deadline to trigger expiration and slashing.
        vm.warp(deadline + 1);
        vm.prank(employer);
        jobRegistry.cancelExpiredJob(jobId);

        uint256 slashBps = config.maliciousSlashBps();
        uint256 expectedStake = 50 ether - ((50 ether * slashBps) / stakeManager.BPS_DENOMINATOR());

        assertEq(stakeManager.stakeOf(agent), expectedStake);
        assertEq(stakeManager.lockedStakeForJob(agent, jobId), 0);
        assertEq(stakeManager.availableStakeOf(agent), expectedStake);
    }

    function testNoRevealSlashesAndRefunds() public {
        uint256 reward = 80 ether;
        uint64 deadline = uint64(block.timestamp + 2 days);
        uint256 employerInitial = token.balanceOf(employer);
        uint256 validatorInitialStake = stakeManager.stakeOf(validators[1]);
        vm.prank(employer);
        uint256 jobId = jobRegistry.createJob(agent, validators, reward, deadline, keccak256("job2"));

        vm.prank(agent);
        jobRegistry.submitResult(jobId);

        // Only first validator participates.
        bytes32 salt = keccak256("salt-no-reveal");
        bytes32 commitment = keccak256(abi.encodePacked(jobId, validators[0], true, salt));
        vm.prank(validators[0]);
        validationModule.commit(jobId, commitment);

        vm.warp(block.timestamp + config.commitWindow() + 1);
        vm.prank(validators[0]);
        validationModule.reveal(jobId, true, salt);

        // Advance beyond reveal window to trigger quorum failure.
        vm.warp(block.timestamp + config.revealWindow() + 1);
        validationModule.finalize(jobId);

        (, , , , , bool finalized, bool success, , ,) = jobRegistry.jobs(jobId);
        assertTrue(finalized);
        assertFalse(success);

        // Employer refunded escrow and credited with exact slashed stake from non-revealer.
        assertEq(token.balanceOf(employer), employerInitial);
        uint256 pending = stakeManager.pendingWithdrawals(employer);
        uint256 expectedSlash = (validatorInitialStake * config.noRevealSlashBps()) / 10_000;
        assertEq(pending, expectedSlash);
        assertEq(stakeManager.stakeOf(validators[1]), validatorInitialStake - expectedSlash);

        // Claim slashed amount.
        vm.prank(employer);
        stakeManager.claim();
        assertEq(token.balanceOf(employer), employerInitial + pending);
        assertEq(stakeManager.pendingWithdrawals(employer), 0);
    }

    function testValidationRejectionSlashesAgent() public {
        uint256 reward = 100 ether;
        uint64 deadline = uint64(block.timestamp + 4 days);
        uint256 employerInitial = token.balanceOf(employer);
        uint256 agentInitialStake = stakeManager.stakeOf(agent);
        vm.prank(employer);
        uint256 jobId = jobRegistry.createJob(agent, validators, reward, deadline, keccak256("job3"));

        vm.prank(agent);
        jobRegistry.submitResult(jobId);

        bytes32[] memory salts = new bytes32[](validators.length);
        bool[] memory approvals = new bool[](validators.length);
        approvals[0] = true;
        approvals[1] = false;

        for (uint256 i = 0; i < validators.length; i++) {
            salts[i] = keccak256(abi.encodePacked("reveal", i));
            bytes32 commitment = keccak256(abi.encodePacked(jobId, validators[i], approvals[i], salts[i]));
            vm.prank(validators[i]);
            validationModule.commit(jobId, commitment);
        }

        vm.warp(block.timestamp + config.commitWindow() + 1);

        for (uint256 i = 0; i < validators.length; i++) {
            vm.prank(validators[i]);
            validationModule.reveal(jobId, approvals[i], salts[i]);
        }

        validationModule.finalize(jobId);

        KernelJobRegistry.Job memory job = _job(jobId);
        assertTrue(job.finalized);
        assertFalse(job.success);

        uint256 expectedSlash = (agentInitialStake * config.maliciousSlashBps()) / 10_000;
        assertEq(stakeManager.stakeOf(agent), agentInitialStake - expectedSlash);
        assertEq(stakeManager.pendingWithdrawals(employer), expectedSlash);

        // Claim the slashed stake and ensure the employer is made whole plus compensation.
        vm.prank(employer);
        stakeManager.claim();
        assertEq(token.balanceOf(employer), employerInitial + expectedSlash);
        assertEq(stakeManager.pendingWithdrawals(employer), 0);

        // No rewards distributed when validation rejects.
        assertEq(token.balanceOf(agent), 0);
        assertEq(token.balanceOf(validators[0]), 0);
        assertEq(token.balanceOf(validators[1]), 0);
        assertEq(escrowVault.balanceOf(jobId), 0);
    }

    function testCancelExpiredJobSlashesAgentAndRefundsEmployer() public {
        uint256 reward = 90 ether;
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 employerInitial = token.balanceOf(employer);
        uint256 agentInitialStake = stakeManager.stakeOf(agent);
        vm.prank(employer);
        uint256 jobId = jobRegistry.createJob(agent, validators, reward, deadline, keccak256("job4"));

        // Advance beyond the deadline so the job expires without submission.
        vm.warp(uint256(deadline) + 1);

        vm.prank(employer);
        jobRegistry.cancelExpiredJob(jobId);

        KernelJobRegistry.Job memory job = _job(jobId);
        assertTrue(job.finalized);
        assertFalse(job.success);
        assertEq(escrowVault.balanceOf(jobId), 0);

        uint256 expectedSlash = (agentInitialStake * config.maliciousSlashBps()) / 10_000;
        assertEq(stakeManager.stakeOf(agent), agentInitialStake - expectedSlash);
        assertEq(stakeManager.pendingWithdrawals(employer), expectedSlash);
        assertEq(jobRegistry.activeJobs(agent), 0);

        vm.prank(employer);
        stakeManager.claim();
        assertEq(token.balanceOf(employer), employerInitial + expectedSlash);
        assertEq(stakeManager.pendingWithdrawals(employer), 0);
    }
}
