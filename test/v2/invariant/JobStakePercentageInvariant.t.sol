// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from 'forge-std/Test.sol';
import {JobRegistryBase} from '../../../contracts/v2/implementation/JobRegistryBase.sol';

contract PercentagePolicyHarness is JobRegistryBase {
    constructor(address governor) JobRegistryBase(governor) {}
    function rate(uint256 bps) external { _entry_setJobStakeBps(bps); }
    function quote(uint256 reward) external view returns (uint96) { return _quoteJobStake(reward); }
    function snapshot(uint256 id, uint256 reward, string calldata uri) external {
        _initialiseJobStorage(id, reward, uint64(block.timestamp + 1), 3, bytes32(uint256(1)), uri, 0);
    }
    function collateral(uint256 id) external view returns (uint96) { return jobs[id].stake; }
}

contract JobStakePercentageInvariantTest is Test {
    PercentagePolicyHarness internal policy;
    function setUp() public { policy = new PercentagePolicyHarness(address(this)); }
    function testFuzz_CeilingAndCreationSnapshot(uint128 reward, uint16 proposedRate, uint16 nextRate) public {
        uint256 bps = bound(uint256(proposedRate), 0, 10000);
        uint256 afterBps = bound(uint256(nextRate), 0, 10000);
        policy.rate(bps);
        uint256 expected = (uint256(reward) * bps + 9999) / 10000;
        if (expected > type(uint96).max) {
            vm.expectRevert(bytes4(keccak256('StakeOverflow()')));
            policy.quote(reward);
            return;
        }
        assertEq(policy.quote(reward), expected);
        policy.snapshot(1, reward, 'ipfs://fixture');
        policy.rate(afterBps);
        assertEq(policy.collateral(1), expected);
        if (reward != 0 && bps != 0) {
            assertGt(expected, 0);
            assertGe(expected * 10000, uint256(reward) * bps);
            assertLt((expected - 1) * 10000, uint256(reward) * bps);
        }
    }
    function testFuzz_RejectsExcessRate(uint256 value) public {
        uint256 bps = bound(value, 10001, type(uint256).max);
        vm.expectRevert(bytes4(keccak256('InvalidPercentage()')));
        policy.rate(bps);
    }
}
