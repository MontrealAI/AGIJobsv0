// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {DisputeModule} from "../../contracts/v2/modules/DisputeModule.sol";
import {MockJobRegistry, MockStakeManager} from "../../contracts/legacy/MockV2.sol";
import {IJobRegistry} from "../../contracts/v2/interfaces/IJobRegistry.sol";
import {IStakeManager} from "../../contracts/v2/interfaces/IStakeManager.sol";

contract DisputeModuleFuzz is Test {
    DisputeModule internal dispute;
    MockJobRegistry internal registry;
    MockStakeManager internal stake;
    uint256 internal constant jobId = 1;
    address internal agent = address(0xBEEF);
    address internal employer = address(0xCAFE);
    address internal committee = address(this);

    function setUp() public {
        registry = new MockJobRegistry();
        stake = new MockStakeManager();
        registry.setStakeManager(address(stake));
        dispute = new DisputeModule(IJobRegistry(address(registry)), 1e18, 1 days, committee);
        dispute.setStakeManager(IStakeManager(address(stake)));
        registry.setDisputeModule(address(dispute));
        IJobRegistry.Job memory job = IJobRegistry.Job({
            employer: employer,
            agent: agent,
            reward: 0,
            stake: 0,
            success: true,
            status: IJobRegistry.Status.Disputed,
            uriHash: bytes32(0),
            resultHash: bytes32(0)
        });
        registry.setJob(jobId, job);
    }

    function testFuzz_resolveAfterWindow(uint32 offset, bool employerWins) public {
        vm.prank(address(registry));
        dispute.raiseDispute(jobId, agent, keccak256("evidence"));
        uint256 window = dispute.disputeWindow();
        offset = uint32(bound(offset, 0, type(uint32).max - uint32(window)));
        vm.warp(block.timestamp + window + offset);
        vm.prank(committee);
        dispute.resolve(jobId, employerWins);
        IJobRegistry.Job memory job = registry.jobs(jobId);
        assertEq(uint8(job.status), uint8(IJobRegistry.Status.Finalized));
        (, uint256 raisedAt,,,) = dispute.disputes(jobId);
        assertEq(raisedAt, 0);
    }

    function testFuzz_resolveBeforeWindow(uint32 early) public {
        vm.prank(address(registry));
        dispute.raiseDispute(jobId, agent, keccak256("evidence"));
        uint256 window = dispute.disputeWindow();
        early = uint32(bound(early, 0, uint32(window - 1)));
        vm.warp(block.timestamp + early);
        vm.prank(committee);
        vm.expectRevert("window");
        dispute.resolve(jobId, true);
    }
}

