// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {
    JobRegistry,
    IValidationModule,
    IStakeManager,
    IReputationEngine,
    IDisputeModule,
    ICertificateNFT,
    IFeePool,
    ITaxPolicy
} from "../../contracts/v2/JobRegistry.sol";

contract JobRegistryDeadlineFuzz is Test {
    JobRegistry registry;
    TimelockController governance;

    function setUp() public {
        address[] memory proposers = new address[](1);
        proposers[0] = address(this);
        address[] memory executors = new address[](1);
        executors[0] = address(this);
        governance = new TimelockController(0, proposers, executors, address(this));
        registry = new JobRegistry(
            IValidationModule(address(0)),
            IStakeManager(address(0)),
            IReputationEngine(address(0)),
            IDisputeModule(address(0)),
            ICertificateNFT(address(0)),
            IFeePool(address(0)),
            ITaxPolicy(address(0)),
            0,
            0,
            new address[](0),
            address(governance)
        );
    }

    function testFuzz_deadline(uint64 deadline) public {
        uint256 reward = 1;
        if (deadline <= block.timestamp) {
            vm.expectRevert(JobRegistry.InvalidDeadline.selector);
            registry.createJob(reward, deadline, bytes32(uint256(1)), "uri");
        } else {
            registry.createJob(reward, deadline, bytes32(uint256(1)), "uri");
        }
    }

    function testSetFeePctEmitsWhenValueChanges() public {
        uint256 target = 15;
        vm.expectEmit(false, false, false, true, address(registry));
        emit JobRegistry.FeePctUpdated(target);
        vm.prank(address(governance));
        registry.setFeePct(target);
        assertEq(registry.feePct(), target, "fee pct not updated");
    }

    function testSetFeePctNoEmitWhenUnchanged() public {
        uint256 current = registry.feePct();
        vm.prank(address(governance));
        vm.recordLogs();
        registry.setFeePct(current);
        Vm.Log[] memory entries = vm.getRecordedLogs();
        assertEq(entries.length, 0, "unexpected events emitted");
        assertEq(registry.feePct(), current, "fee pct changed unexpectedly");
    }
}

