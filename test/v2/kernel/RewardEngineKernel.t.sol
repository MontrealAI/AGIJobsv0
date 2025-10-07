// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";

import {RewardEngine} from "../../../contracts/v2/kernel/RewardEngine.sol";

contract RewardEngineKernelTest is Test {
    RewardEngine internal engine;
    address internal governance = address(0x1234);

    function setUp() public {
        engine = new RewardEngine(governance);
    }

    function testDefaultSplitSumsBelowDenominator() public view {
        (uint256 agents, uint256 validators, uint256 ops, uint256 employer, uint256 burn) =
            _currentBps();
        assertLt(agents + validators + ops + employer + burn, 10_001);
    }

    function testSplitProducesExpectedAmounts() public {
        RewardEngine.SplitResult memory split = engine.split(1, 100 ether);
        RewardEngine.SplitConfig memory config = _splitConfig();
        assertEq(split.agentAmount, (100 ether * config.agentsBps) / 10_000);
        assertEq(split.validatorAmount, (100 ether * config.validatorsBps) / 10_000);
        assertEq(split.opsAmount, (100 ether * config.opsBps) / 10_000);
        assertEq(split.employerRebateAmount, (100 ether * config.employerRebateBps) / 10_000);
        assertEq(split.burnAmount, (100 ether * config.burnBps) / 10_000);
    }

    function testUpdateSplits() public {
        RewardEngine.SplitConfig memory config = RewardEngine.SplitConfig({
            agentsBps: 5_000,
            validatorsBps: 3_000,
            opsBps: 1_000,
            employerRebateBps: 500,
            burnBps: 400
        });
        vm.prank(governance);
        engine.setSplits(config);
        RewardEngine.SplitConfig memory updated = _splitConfig();
        assertEq(updated.validatorsBps, 3_000);
    }

    function testUpdateSplitsRevertsOnOverflow() public {
        RewardEngine.SplitConfig memory config = RewardEngine.SplitConfig({
            agentsBps: 9_000,
            validatorsBps: 1_500,
            opsBps: 0,
            employerRebateBps: 0,
            burnBps: 0
        });
        vm.prank(governance);
        vm.expectRevert(RewardEngine.InvalidSplits.selector);
        engine.setSplits(config);
    }

    function _currentBps() internal view returns (uint256, uint256, uint256, uint256, uint256) {
        RewardEngine.SplitConfig memory config = _splitConfig();
        return (
            config.agentsBps,
            config.validatorsBps,
            config.opsBps,
            config.employerRebateBps,
            config.burnBps
        );
    }

    function _splitConfig() internal view returns (RewardEngine.SplitConfig memory config) {
        (
            uint256 agents,
            uint256 validators,
            uint256 ops,
            uint256 employer,
            uint256 burn
        ) = engine.splits();

        config = RewardEngine.SplitConfig({
            agentsBps: agents,
            validatorsBps: validators,
            opsBps: ops,
            employerRebateBps: employer,
            burnBps: burn
        });
    }
}
