// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "contracts/v2/ReputationEngine.sol";
import "contracts/legacy/MockV2.sol";
import "contracts/test/TerminalReputationRegistryHarness.sol";

contract ReputationIncentivesTest is Test {
    ReputationEngine engine;
    MockStakeManager stake;
    TerminalReputationRegistryHarness registry;

    address honestAgent = address(0x1);
    address cheatAgent = address(0x2);
    address honestValidator = address(0x3);
    address cheatValidator = address(0x4);

    function setUp() public {
        stake = new MockStakeManager();
        engine = new ReputationEngine(stake);
        engine.setCaller(address(this), true);
        engine.setPremiumThreshold(1);
        registry = new TerminalReputationRegistryHarness();
        registry.setValidationModule(address(this));
        engine.setJobRegistry(address(registry), true);
    }

    function discountedSum(int256[] memory deltas) internal pure returns (int256 sum) {
        int256 factor = int256(1e18);
        int256 deltaFactor = int256(9e17); // 0.9
        for (uint256 i = 0; i < deltas.length; i++) {
            sum += (deltas[i] * factor) / int256(1e18);
            factor = (factor * deltaFactor) / int256(1e18);
        }
    }

    // This finite score scenario is not a proof of honesty or incentive compatibility.
    function testTerminalSuccessAndAttributedFailureScenario() public {
        uint256 payout = 100 ether;
        uint256 rounds = 3;

        int256[] memory agentHonest = new int256[](rounds);
        int256[] memory agentCheat = new int256[](rounds);
        int256[] memory validatorHonest = new int256[](rounds);
        int256[] memory validatorCheat = new int256[](rounds);


        for (uint256 i = 0; i < rounds; i++) {
            uint256 prev = engine.reputationOf(honestAgent);
            uint256 successId = i * 2 + 1;
            uint256 failureId = successId + 1;
            openRound(successId, honestAgent, honestValidator);
            openRound(failureId, cheatAgent, cheatValidator);
            assertEq(engine.reputationOf(honestAgent), prev);
            registry.settle(successId, honestAgent, true, false, payout);
            uint256 afterRep = engine.reputationOf(honestAgent);
            agentHonest[i] = int256(afterRep) - int256(prev);

            prev = engine.reputationOf(honestValidator);
            engine.accountValidator(address(registry), successId, 0);
            afterRep = engine.reputationOf(honestValidator);
            validatorHonest[i] = int256(afterRep) - int256(prev);

            prev = engine.reputationOf(cheatAgent);
            registry.settle(failureId, cheatAgent, false, true, 0);
            afterRep = engine.reputationOf(cheatAgent);
            agentCheat[i] = int256(afterRep) - int256(prev);

            prev = engine.reputationOf(cheatValidator);
            engine.accountValidator(address(registry), failureId, 0);
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

    function openRound(uint256 jobId, address agent, address validator) internal {
        registry.open(jobId, address(engine));
        registry.assign(jobId, agent);
        registry.submit(jobId);
        address[] memory validators = new address[](1);
        validators[0] = validator;
        bool[] memory revealed = new bool[](1);
        revealed[0] = true;
        bool[] memory votes = new bool[](1);
        votes[0] = true;
        engine.recordRound(address(registry), jobId, 1, validators, revealed, votes, true);
    }

    function testAdministrativeNegativeUpdateRetainsEntropySemantics() public {
        engine.add(cheatValidator, 10);
        engine.update(cheatValidator, -3);
        assertEq(engine.reputationOf(cheatValidator), 7);
        assertEq(engine.getEntropy(cheatValidator), 3);
    }

    function testLegacyLifecycleIsExplicitlyUnsupported() public {
        vm.expectRevert(ReputationEngine.LegacyReputationLifecycleUnsupported.selector);
        engine.onFinalize(honestAgent, true, 100 ether, 100000);
        vm.expectRevert(ReputationEngine.LegacyReputationLifecycleUnsupported.selector);
        engine.rewardValidator(honestValidator, 24);
    }

}

