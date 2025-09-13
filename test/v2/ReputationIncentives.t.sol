// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "contracts/v2/ReputationEngine.sol";
import "contracts/legacy/MockV2.sol";

contract ReputationIncentivesTest is Test {
    ReputationEngine engine;
    MockStakeManager stake;

    address honestAgent = address(0x1);
    address cheatAgent = address(0x2);
    address honestValidator = address(0x3);
    address cheatValidator = address(0x4);

    function setUp() public {
        stake = new MockStakeManager();
        engine = new ReputationEngine(stake);
        engine.setCaller(address(this), true);
        engine.setPremiumThreshold(1);
    }

    function discountedSum(int256[] memory deltas) internal pure returns (int256 sum) {
        int256 factor = int256(1e18);
        int256 deltaFactor = int256(9e17); // 0.9
        for (uint256 i = 0; i < deltas.length; i++) {
            sum += (deltas[i] * factor) / int256(1e18);
            factor = (factor * deltaFactor) / int256(1e18);
        }
    }

    function testHonestyOutperformsCheating() public {
        uint256 payout = 100 ether;
        uint256 duration = 100000;
        uint256 rounds = 3;

        int256[] memory agentHonest = new int256[](rounds);
        int256[] memory agentCheat = new int256[](rounds);
        int256[] memory validatorHonest = new int256[](rounds);
        int256[] memory validatorCheat = new int256[](rounds);

        uint256 gain = engine.calculateReputationPoints(payout, duration);

        for (uint256 i = 0; i < rounds; i++) {
            uint256 prev = engine.reputationOf(honestAgent);
            engine.onFinalize(honestAgent, true, payout, duration);
            uint256 afterRep = engine.reputationOf(honestAgent);
            agentHonest[i] = int256(afterRep) - int256(prev);

            prev = engine.reputationOf(honestValidator);
            engine.rewardValidator(honestValidator, gain);
            afterRep = engine.reputationOf(honestValidator);
            validatorHonest[i] = int256(afterRep) - int256(prev);

            prev = engine.reputationOf(cheatAgent);
            engine.onFinalize(cheatAgent, false, payout, duration);
            afterRep = engine.reputationOf(cheatAgent);
            agentCheat[i] = int256(afterRep) - int256(prev);

            prev = engine.reputationOf(cheatValidator);
            engine.update(cheatValidator, -int256(gain));
            afterRep = engine.reputationOf(cheatValidator);
            validatorCheat[i] = int256(afterRep) - int256(prev);
        }

        int256 honestAgentNPV = discountedSum(agentHonest);
        int256 cheatAgentNPV = discountedSum(agentCheat);
        int256 honestValidatorNPV = discountedSum(validatorHonest);
        int256 cheatValidatorNPV = discountedSum(validatorCheat);

        assertGt(honestAgentNPV, cheatAgentNPV);
        assertGt(honestValidatorNPV, cheatValidatorNPV);
    }
}

