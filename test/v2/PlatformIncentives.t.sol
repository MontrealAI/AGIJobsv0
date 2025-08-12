// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {AGIALPHAToken} from "../../contracts/v2/AGIALPHAToken.sol";
import {StakeManager} from "../../contracts/v2/StakeManager.sol";
import {PlatformRegistry} from "../../contracts/v2/PlatformRegistry.sol";
import {JobRouter} from "../../contracts/v2/modules/JobRouter.sol";
import {IPlatformRegistryFull} from "../../contracts/v2/interfaces/IPlatformRegistryFull.sol";
import {IJobRouter} from "../../contracts/v2/interfaces/IJobRouter.sol";
import {IPlatformRegistry} from "../../contracts/v2/interfaces/IPlatformRegistry.sol";
import {IReputationEngine} from "../../contracts/v2/interfaces/IReputationEngine.sol";
import {FeePool} from "../../contracts/v2/FeePool.sol";
import {PlatformIncentives} from "../../contracts/v2/PlatformIncentives.sol";
import {MockJobRegistry, MockReputationEngine} from "../../contracts/mocks/MockV2.sol";
import {IStakeManager} from "../../contracts/v2/interfaces/IStakeManager.sol";

contract PlatformIncentivesTest is Test {
    AGIALPHAToken token;
    StakeManager stakeManager;
    PlatformRegistry platformRegistry;
    JobRouter jobRouter;
    FeePool feePool;
    PlatformIncentives incentives;
    MockJobRegistry jobRegistry;
    MockReputationEngine rep;

    address operator = address(0xBEEF);

    function setUp() public {
        token = new AGIALPHAToken();
        stakeManager = new StakeManager(
            token,
            0,
            0,
            0,
            address(this),
            address(0),
            address(0)
        );
        jobRegistry = new MockJobRegistry();
        jobRegistry.setTaxPolicyVersion(1);
        stakeManager.setJobRegistry(address(jobRegistry));
        rep = new MockReputationEngine();
        platformRegistry = new PlatformRegistry(
            IStakeManager(address(stakeManager)),
            rep,
            1e6,
            address(this)
        );
        jobRouter = new JobRouter(IPlatformRegistry(address(platformRegistry)), address(this));
        feePool = new FeePool(token, IStakeManager(address(stakeManager)), IStakeManager.Role.Platform, address(this));
        incentives = new PlatformIncentives(
            IStakeManager(address(stakeManager)),
            IPlatformRegistryFull(address(platformRegistry)),
            IJobRouter(address(jobRouter)),
            address(this)
        );
        platformRegistry.setRegistrar(address(incentives), true);
        jobRouter.setRegistrar(address(incentives), true);

        token.mint(operator, 20e6);
        vm.startPrank(operator);
        jobRegistry.acknowledgeTaxPolicy();
        token.approve(address(stakeManager), type(uint256).max);
        vm.stopPrank();
    }

    function testStakeAndActivate() public {
        vm.prank(operator);
        incentives.stakeAndActivate(10e6);
        assertEq(stakeManager.stakeOf(operator, StakeManager.Role.Platform), 10e6);
        assertTrue(platformRegistry.registered(operator));
        assertTrue(jobRouter.registered(operator));

        incentives.stakeAndActivate(0);
        assertTrue(platformRegistry.registered(address(this)));
        assertTrue(jobRouter.registered(address(this)));
        assertEq(platformRegistry.getScore(address(this)), 0);
        assertEq(jobRouter.routingWeight(address(this)), 0);

        token.mint(address(this), 5e6);
        token.transfer(address(feePool), 5e6);
        vm.prank(address(stakeManager));
        feePool.depositFee(5e6);
        feePool.distributeFees();

        uint256 before = token.balanceOf(operator);
        vm.prank(operator);
        feePool.claimRewards();
        assertEq(token.balanceOf(operator) - before, 5e6);

        uint256 ownerBefore = token.balanceOf(address(this));
        vm.expectEmit(true, false, false, true, address(feePool));
        emit FeePool.RewardsClaimed(address(this), 0);
        feePool.claimRewards();
        assertEq(token.balanceOf(address(this)) - ownerBefore, 0);
    }

    function testStakeZeroRevertsForNonOwner() public {
        vm.prank(operator);
        vm.expectRevert(bytes("amount"));
        incentives.stakeAndActivate(0);
    }
}
