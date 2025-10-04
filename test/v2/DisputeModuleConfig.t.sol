// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {DisputeModule} from "../../contracts/v2/modules/DisputeModule.sol";
import {IJobRegistry} from "../../contracts/v2/interfaces/IJobRegistry.sol";
import {Governable} from "../../contracts/v2/Governable.sol";

contract DisputeModuleConfigTest is Test {
    DisputeModule dispute;
    TimelockController governance;

    function setUp() public {
        address[] memory proposers = new address[](1);
        proposers[0] = address(this);
        address[] memory executors = new address[](1);
        executors[0] = address(this);
        governance = new TimelockController(0, proposers, executors, address(this));
        dispute = new DisputeModule(
            IJobRegistry(address(0)),
            0,
            0,
            address(0),
            address(governance)
        );
    }

    function testSetDisputeFeeEmitsAndUpdates() public {
        uint256 target = 2e18;
        vm.expectEmit(false, false, false, true, address(dispute));
        emit DisputeModule.DisputeFeeUpdated(target);
        vm.prank(address(governance));
        dispute.setDisputeFee(target);
        assertEq(dispute.disputeFee(), target, "fee not updated");
    }

    function testSetDisputeFeeOnlyGovernance() public {
        vm.expectRevert(Governable.NotGovernance.selector);
        dispute.setDisputeFee(1);
    }
}
