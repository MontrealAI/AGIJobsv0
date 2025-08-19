// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {JobRegistry} from "../../contracts/v2/JobRegistry.sol";
import {ValidationStub} from "../../contracts/v2/mocks/ValidationStub.sol";
import {MockStakeManager} from "../../contracts/mocks/MockV2.sol";
import {DisputeModule} from "../../contracts/v2/modules/DisputeModule.sol";
import {IJobRegistry} from "../../contracts/v2/interfaces/IJobRegistry.sol";
import {IReputationEngine} from "../../contracts/v2/interfaces/IReputationEngine.sol";
import {ICertificateNFT} from "../../contracts/v2/interfaces/ICertificateNFT.sol";
import {IFeePool} from "../../contracts/v2/interfaces/IFeePool.sol";
import {ITaxPolicy} from "../../contracts/v2/interfaces/ITaxPolicy.sol";
import {IDisputeModule} from "../../contracts/v2/interfaces/IDisputeModule.sol";

contract JobRegistryLifecycleTest is Test {
    JobRegistry registry;
    ValidationStub validation;
    MockStakeManager stake;
    DisputeModule dispute;

    address employer = address(0xA1);
    address agent = address(0xB2);

    function setUp() public {
        stake = new MockStakeManager();
        validation = new ValidationStub();
        registry = new JobRegistry(
            validation,
            stake,
            IReputationEngine(address(0)),
            IDisputeModule(address(0)),
            ICertificateNFT(address(0)),
            IFeePool(address(0)),
            ITaxPolicy(address(0)),
            0,
            0,
            new address[](0)
        );
        validation.setJobRegistry(address(registry));
        stake.setJobRegistry(address(registry));
        registry.setJobParameters(0, 0);
        registry.setMaxJobReward(1000);
        registry.setMaxJobDuration(1000);
        registry.setFeePct(0);

        vm.prank(employer);
        registry.acknowledgeTaxPolicy();
        vm.prank(agent);
        registry.acknowledgeTaxPolicy();

        dispute = new DisputeModule(IJobRegistry(address(registry)), 0, 0, address(0));
        registry.setDisputeModule(address(dispute));
        stake.setDisputeModule(address(dispute));
    }

    function testHappyPathFinalize() public {
        uint64 deadline = uint64(block.timestamp + 100);
        vm.prank(employer);
        uint256 jobId = registry.createJob(10, deadline, "uri");

        vm.prank(agent);
        registry.applyForJob(jobId, "", new bytes32[](0));

        vm.prank(agent);
        registry.submit(jobId, "res");

        validation.setResult(true);
        validation.finalize(jobId);

        JobRegistry.Job memory job = registry.jobs(jobId);
        assertEq(uint(job.state), uint(JobRegistry.State.Finalized));
        assertTrue(job.success);
    }

    function testCancelJob() public {
        uint64 deadline = uint64(block.timestamp + 100);
        vm.prank(employer);
        uint256 jobId = registry.createJob(10, deadline, "uri");
        vm.prank(employer);
        registry.cancelJob(jobId);
        JobRegistry.Job memory job = registry.jobs(jobId);
        assertEq(uint(job.state), uint(JobRegistry.State.Cancelled));
    }

    function testDisputeFlow() public {
        uint64 deadline = uint64(block.timestamp + 100);
        vm.prank(employer);
        uint256 jobId = registry.createJob(10, deadline, "uri");

        vm.prank(agent);
        registry.applyForJob(jobId, "", new bytes32[](0));

        vm.prank(agent);
        registry.submit(jobId, "res");

        validation.setResult(false);
        validation.finalize(jobId);

        vm.prank(agent);
        registry.dispute(jobId, "evidence");

        dispute.resolveDispute(jobId, true);

        JobRegistry.Job memory job = registry.jobs(jobId);
        assertEq(uint(job.state), uint(JobRegistry.State.Finalized));
        assertFalse(job.success);
    }
}
