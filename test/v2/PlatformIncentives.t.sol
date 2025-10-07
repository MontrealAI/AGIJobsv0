// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {AGIALPHA, TOKEN_SCALE} from "../../contracts/v2/Constants.sol";
import {StakeManager} from "../../contracts/v2/StakeManager.sol";
import {
    PlatformRegistry,
    IReputationEngine as PlatformReputationEngine
} from "../../contracts/v2/PlatformRegistry.sol";
import {JobRouter} from "../../contracts/v2/modules/JobRouter.sol";
import {IPlatformRegistryFull} from "../../contracts/v2/interfaces/IPlatformRegistryFull.sol";
import {IJobRouter} from "../../contracts/v2/interfaces/IJobRouter.sol";
import {IPlatformRegistry} from "../../contracts/v2/interfaces/IPlatformRegistry.sol";
import {FeePool} from "../../contracts/v2/FeePool.sol";
import {PlatformIncentives} from "../../contracts/v2/PlatformIncentives.sol";
import {MockJobRegistry} from "../../contracts/legacy/MockV2.sol";
import {IStakeManager} from "../../contracts/v2/interfaces/IStakeManager.sol";
import {ITaxPolicy} from "../../contracts/v2/interfaces/ITaxPolicy.sol";

contract EmployerScoreRegistry is MockJobRegistry {
    function getEmployerScore(address)
        public
        pure
        override
        returns (uint256)
    {
        return TOKEN_SCALE;
    }
}

contract PlatformIncentivesTest is Test {
    AGIALPHAToken token;
    StakeManager stakeManager;
    PlatformRegistry platformRegistry;
    JobRouter jobRouter;
    FeePool feePool;
    PlatformIncentives incentives;
    EmployerScoreRegistry jobRegistry;

    address operator = address(0xBEEF);
    address treasury = address(0xBADD);

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        token = AGIALPHAToken(payable(AGIALPHA));
        jobRegistry = new EmployerScoreRegistry();
        jobRegistry.setTaxPolicyVersion(1);
        stakeManager = new StakeManager(0, 0, 0, treasury, address(jobRegistry), address(0), address(this));
        platformRegistry = new PlatformRegistry(
            IStakeManager(address(stakeManager)),
            PlatformReputationEngine(address(0)),
            1e18
        );
        jobRouter = new JobRouter(IPlatformRegistry(address(platformRegistry)));
        feePool = new FeePool(IStakeManager(address(stakeManager)), 0, treasury, ITaxPolicy(address(0)));
        incentives = new PlatformIncentives(
            IStakeManager(address(stakeManager)),
            IPlatformRegistryFull(address(platformRegistry)),
            IJobRouter(address(jobRouter))
        );
        platformRegistry.setRegistrar(address(incentives), true);
        jobRouter.setRegistrar(address(incentives), true);

        token.mint(operator, 20e18);
        vm.startPrank(operator);
        jobRegistry.acknowledgeTaxPolicy();
        token.approve(address(stakeManager), type(uint256).max);
        vm.stopPrank();
    }

    function testStakeAndActivate() public {
        vm.prank(operator);
        incentives.stakeAndActivate(10e18);
        assertEq(stakeManager.stakeOf(operator, StakeManager.Role.Platform), 10e18);
        assertTrue(platformRegistry.registered(operator));
        assertTrue(jobRouter.registered(operator));

        incentives.stakeAndActivate(0);
        assertTrue(platformRegistry.registered(address(this)));
        assertTrue(jobRouter.registered(address(this)));
        assertEq(platformRegistry.getScore(address(this)), 0);
        assertEq(jobRouter.routingWeight(address(this)), 0);

        token.mint(address(this), 5e18);
        token.transfer(address(feePool), 5e18);
        vm.prank(address(stakeManager));
        feePool.depositFee(5e18);
        feePool.distributeFees();

        uint256 before = token.balanceOf(operator);
        vm.prank(operator);
        feePool.claimRewards();
        assertEq(token.balanceOf(operator) - before, 5e18);

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

    function testDefaultMaxDiscountPct() public {
        assertEq(incentives.maxDiscountPct(), incentives.DEFAULT_MAX_DISCOUNT_PCT());
    }

    function testOwnerCanUpdateMaxDiscountPct() public {
        uint256 previous = incentives.maxDiscountPct();
        uint256 target = 15;
        vm.expectEmit(true, true, true, true, address(incentives));
        emit PlatformIncentives.MaxDiscountPctUpdated(previous, target);
        incentives.setMaxDiscountPct(target);
        assertEq(incentives.maxDiscountPct(), target);
    }

    function testSetMaxDiscountPctRevertsAboveLimit() public {
        uint256 limit = incentives.MAX_DISCOUNT_PCT_LIMIT();
        vm.expectRevert(bytes("pct"));
        incentives.setMaxDiscountPct(limit + 1);
    }

    function testNonOwnerCannotSetMaxDiscountPct() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSignature(
                "OwnableUnauthorizedAccount(address)",
                operator
            )
        );
        incentives.setMaxDiscountPct(10);
    }

    function testMaxDiscountPctAdjustsDiscount() public {
        address employer = address(0xB0B);
        assertEq(incentives.getFeeDiscount(employer), 20);

        incentives.setMaxDiscountPct(5);
        assertEq(incentives.getFeeDiscount(employer), 5);
    }
}
