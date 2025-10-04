// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {ReputationEngine} from "../../contracts/v2/ReputationEngine.sol";
import {MockStakeManager} from "../../contracts/legacy/MockV2.sol";
import {IStakeManager} from "../../contracts/v2/interfaces/IStakeManager.sol";

contract ReputationEngineConfigTest is Test {
    ReputationEngine engine;
    MockStakeManager stakeManager;
    address constant OTHER = address(0xBEEF);

    function setUp() public {
        stakeManager = new MockStakeManager();
        engine = new ReputationEngine(IStakeManager(address(stakeManager)));
    }

    function testSetPremiumThresholdEmitsAndUpdatesStorage() public {
        uint256 target = 1_000;
        vm.expectEmit(false, false, false, true, address(engine));
        emit ReputationEngine.PremiumThresholdUpdated(target);
        engine.setPremiumThreshold(target);
        assertEq(engine.premiumThreshold(), target, "threshold not updated");
    }

    function testSetPremiumThresholdOnlyOwner() public {
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", OTHER));
        vm.prank(OTHER);
        engine.setPremiumThreshold(500);
    }
}
