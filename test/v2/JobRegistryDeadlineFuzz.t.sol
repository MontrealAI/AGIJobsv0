// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
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

    function setUp() public {
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
            new address[](0)
        );
    }

    function testFuzz_deadline(uint64 deadline) public {
        uint256 reward = 1;
        if (deadline <= block.timestamp) {
            vm.expectRevert("deadline");
            registry.createJob(reward, deadline, "uri");
        } else {
            registry.createJob(reward, deadline, "uri");
        }
    }
}

