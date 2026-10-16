// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from 'forge-std/Test.sol';
import {ReputationEngine} from '../../../contracts/v2/ReputationEngine.sol';
import {MockStakeManager} from '../../../contracts/legacy/MockV2.sol';
import {IStakeManager} from '../../../contracts/v2/interfaces/IStakeManager.sol';

contract ExternalReputationGrowthHarness is ReputationEngine {
    constructor(IStakeManager stake) ReputationEngine(stake) {}
    function grow(uint256 current, uint256 points) external pure returns (uint256) {
        return _enforceReputationGrowth(current, points);
    }
}

contract ReputationGrowthInvariantTest is Test {
    ExternalReputationGrowthHarness internal engine;
    address internal worker = address(0x1234);

    function setUp() public {
        engine = new ExternalReputationGrowthHarness(new MockStakeManager());
        engine.setCaller(address(this), true);
    }

    function testFuzz_PositiveCreditNeverReducesScore(uint256 rawCurrent, uint256 points) public view {
        uint256 current = bound(rawCurrent, 0, engine.MAX_REPUTATION());
        uint256 afterScore = engine.grow(current, points);
        assertGe(afterScore, current);
        assertLe(afterScore, engine.MAX_REPUTATION());
        assertLe(afterScore - current, points);
        assertEq(engine.grow(current, 0), current);
        uint256 boundedAward = bound(points, 0, engine.MAX_REPUTATION());
        uint256 boundedScore = engine.grow(current, boundedAward);
        assertGe(boundedScore, current);
        assertLe(boundedScore - current, boundedAward);
        assertLe(boundedScore, engine.MAX_REPUTATION());
    }

    function testFuzz_LargerAwardCannotReduceCredit(uint256 rawCurrent, uint256 a, uint256 b) public view {
        uint256 current = bound(rawCurrent, 0, engine.MAX_REPUTATION());
        a = bound(a, 0, engine.MAX_REPUTATION());
        b = bound(b, 0, engine.MAX_REPUTATION());
        uint256 lower = a < b ? a : b;
        uint256 upper = a < b ? b : a;
        assertLe(engine.grow(current, lower), engine.grow(current, upper));
    }

    function testFuzz_PublicCreditsRemainMonotonicAcrossSequence(uint256[8] memory awards) public {
        engine.add(worker, 20000);
        for (uint256 i; i < awards.length; ++i) {
            uint256 beforeScore = engine.reputationOf(worker);
            engine.add(worker, bound(awards[i], 0, 1000));
            assertGe(engine.reputationOf(worker), beforeScore);
            assertLe(engine.reputationOf(worker), engine.MAX_REPUTATION());
        }
        uint256 earned = engine.reputationOf(worker);
        engine.subtract(worker, type(uint256).max);
        assertEq(engine.reputationOf(worker), 0);
        if (earned != 0) {
            engine.add(worker, 20000);
            assertEq(engine.reputationOf(worker), 20000);
        }
    }
}
