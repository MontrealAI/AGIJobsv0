// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {AlphaMarkEToken, IAlphaMarkRiskOracle} from "../contracts/AlphaMarkEToken.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract MockRiskOracle is IAlphaMarkRiskOracle {
    bool private _validated;

    function setValidated(bool status) external {
        _validated = status;
    }

    function seedValidated() external view returns (bool) {
        return _validated;
    }
}

contract AlphaMarkCurveTest is Test {
    AlphaMarkEToken internal mark;
    MockRiskOracle internal oracle;

    address internal owner = address(0xA11CE);
    address internal investor = address(0xB0B);

    uint256 internal constant WHOLE = 1e18;

    function setUp() public {
        oracle = new MockRiskOracle();
        vm.deal(owner, 100 ether);
        vm.deal(investor, 1_000 ether);
        vm.prank(owner);
        mark = new AlphaMarkEToken("SeedShares", "SEED", owner, address(oracle), 0.1 ether, 0.05 ether, 0, address(0));
        vm.prank(owner);
        mark.setTreasury(payable(owner));
    }

    function testFuzzPurchasePricing(uint256 seedSupply, uint256 amount) public {
        seedSupply = bound(seedSupply, 0, 20);
        amount = bound(amount, 1, 10);

        if (seedSupply > 0) {
            uint256 seedCost = _discretePurchase(mark.basePrice(), mark.slope(), 0, seedSupply);
            vm.prank(investor);
            mark.buyTokens{value: seedCost}(seedSupply * WHOLE);
        }

        uint256 preview = mark.previewPurchaseCost(amount * WHOLE);
        uint256 expected = _discretePurchase(mark.basePrice(), mark.slope(), seedSupply, amount);
        assertEq(preview, expected, "preview must match discrete summation");

        uint256 previousReserve = mark.reserveBalance();
        vm.prank(investor);
        mark.buyTokens{value: preview}(amount * WHOLE);
        assertEq(mark.reserveBalance(), previousReserve + preview, "reserve increments by purchase cost");
        assertEq(mark.totalSupply(), (seedSupply + amount) * WHOLE, "supply tracks minted whole tokens");
    }

    function testFuzzSellPricing(uint256 minted, uint256 amount) public {
        minted = bound(minted, 1, 20);
        amount = bound(amount, 1, minted);

        uint256 cost = _discretePurchase(mark.basePrice(), mark.slope(), 0, minted);
        vm.prank(investor);
        mark.buyTokens{value: cost}(minted * WHOLE);

        uint256 expectedRefund = _discreteSale(mark.basePrice(), mark.slope(), minted, amount);
        vm.prank(investor);
        mark.sellTokens(amount * WHOLE);
        assertEq(mark.reserveBalance(), cost - expectedRefund, "reserve reduces by redemption amount");
    }

    function testReserveBalanceAccounting() public {
        uint256 first = _discretePurchase(mark.basePrice(), mark.slope(), 0, 3);
        vm.prank(investor);
        mark.buyTokens{value: first}(3 * WHOLE);

        uint256 second = _discretePurchase(mark.basePrice(), mark.slope(), 3, 2);
        vm.prank(investor);
        mark.buyTokens{value: second}(2 * WHOLE);

        uint256 refund = _discreteSale(mark.basePrice(), mark.slope(), 5, 2);
        vm.prank(investor);
        mark.sellTokens(2 * WHOLE);

        assertEq(mark.reserveBalance(), first + second - refund, "reserve reflects net cash flow");
        assertEq(mark.participantContribution(investor), first + second, "contribution history only increases");
    }

    function testSellDuringPauseRequiresEmergencyExit() public {
        uint256 cost = _discretePurchase(mark.basePrice(), mark.slope(), 0, 1);
        vm.prank(investor);
        mark.buyTokens{value: cost}(WHOLE);

        vm.prank(owner);
        mark.pauseMarket();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(investor);
        mark.sellTokens(WHOLE);

        vm.prank(owner);
        mark.setEmergencyExit(true);
        vm.prank(investor);
        mark.sellTokens(WHOLE);
    }

    function testFinalizeRequiresValidation() public {
        uint256 cost = _discretePurchase(mark.basePrice(), mark.slope(), 0, 2);
        vm.prank(investor);
        mark.buyTokens{value: cost}(2 * WHOLE);

        vm.prank(owner);
        vm.expectRevert(AlphaMarkEToken.ValidationRequired.selector);
        mark.finalizeLaunch(payable(owner), "");

        oracle.setValidated(true);
        uint256 ownerBalanceBefore = owner.balance;
        uint256 reserve = mark.reserveBalance();

        vm.prank(owner);
        mark.finalizeLaunch(payable(owner), "");

        assertEq(mark.reserveBalance(), 0, "reserve fully forwarded");
        assertEq(owner.balance, ownerBalanceBefore + reserve, "treasury receives reserve");
    }

    function _discretePurchase(uint256 basePrice_, uint256 slope_, uint256 supply, uint256 amount)
        internal
        pure
        returns (uint256 total)
    {
        for (uint256 i = 0; i < amount; i++) {
            total += basePrice_ + (slope_ * (supply + i));
        }
    }

    function _discreteSale(uint256 basePrice_, uint256 slope_, uint256 supply, uint256 amount)
        internal
        pure
        returns (uint256 total)
    {
        for (uint256 i = 0; i < amount; i++) {
            total += basePrice_ + (slope_ * (supply - 1 - i));
        }
    }
}
