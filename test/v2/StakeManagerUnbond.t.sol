// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {StakeManager} from "../../contracts/v2/StakeManager.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {AGIALPHA} from "../../contracts/v2/Constants.sol";
import {ITaxPolicy} from "../../contracts/v2/interfaces/ITaxPolicy.sol";

error UnbondLocked();
error Jailed();
error PendingPenalty();
error InvalidUnbondingPeriod();

event UnbondingPeriodUpdated(uint256 newPeriod);

contract StakeManagerUnbond is Test {
    StakeManager stake;
    AGIALPHAToken token;
    address user = address(1);

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        vm.store(AGIALPHA, bytes32(uint256(5)), bytes32(uint256(uint160(address(this)))));
        token = AGIALPHAToken(payable(AGIALPHA));
        stake = new StakeManager(1e18, 5_000, 5_000, address(0), address(this), address(this), address(this));
        stake.setMinStake(1);
        vm.prank(address(stake));
        token.acceptTerms();
        token.mint(user, 1e18);
        vm.prank(user);
        token.approve(address(stake), 1e18);
        vm.prank(user);
        stake.depositStake(StakeManager.Role.Validator, 1e18);
    }

    function taxPolicy() external pure returns (ITaxPolicy) {
        return ITaxPolicy(address(0));
    }

    function _request(uint256 amount) internal {
        vm.prank(user);
        stake.requestWithdraw(StakeManager.Role.Validator, amount);
    }

    function testUnbondDelay() public {
        _request(5e17);
        vm.prank(user);
        vm.expectRevert(UnbondLocked.selector);
        stake.finalizeWithdraw(StakeManager.Role.Validator);

        vm.warp(block.timestamp + stake.unbondingPeriod());
        uint256 beforeBal = token.balanceOf(user);
        vm.prank(user);
        stake.finalizeWithdraw(StakeManager.Role.Validator);
        assertEq(token.balanceOf(user), beforeBal + 5e17);
    }

    function testJailOnSlash() public {
        _request(5e17);
        stake.slash(user, StakeManager.Role.Validator, 1e17, address(this));
        vm.prank(user);
        vm.expectRevert(UnbondLocked.selector);
        stake.finalizeWithdraw(StakeManager.Role.Validator);
    }

    function testSlashWhileUnbondingAllowsNewWithdraw() public {
        _request(5e17);
        stake.slash(user, StakeManager.Role.Validator, 1e17, address(this));

        (uint256 pending, uint64 unlockAt, bool jailed) = stake.unbonds(user);
        assertFalse(jailed);
        assertEq(pending, 45e16);
        assertEq(unlockAt, uint64(block.timestamp + stake.unbondingPeriod()));

        vm.warp(block.timestamp + stake.unbondingPeriod());
        uint256 balanceBefore = token.balanceOf(user);
        vm.prank(user);
        stake.finalizeWithdraw(StakeManager.Role.Validator);
        assertEq(token.balanceOf(user), balanceBefore + 45e16);

        (pending,,) = stake.unbonds(user);
        assertEq(pending, 0);

        vm.prank(user);
        stake.requestWithdraw(StakeManager.Role.Validator, 2e17);
    }

    function testPendingPenaltyRace() public {
        _request(5e17);
        stake.lockStake(user, 1e17, 1 days);
        vm.warp(block.timestamp + stake.unbondingPeriod());
        vm.prank(user);
        vm.expectRevert(PendingPenalty.selector);
        stake.finalizeWithdraw(StakeManager.Role.Validator);

        stake.releaseStake(user, 1e17);
        uint256 balBefore = token.balanceOf(user);
        vm.prank(user);
        stake.finalizeWithdraw(StakeManager.Role.Validator);
        assertEq(token.balanceOf(user), balBefore + 5e17);
    }

    function testSetUnbondingPeriod() public {
        uint256 newPeriod = 3 days;
        vm.expectEmit(false, false, false, true);
        emit UnbondingPeriodUpdated(newPeriod);
        stake.setUnbondingPeriod(newPeriod);
        assertEq(stake.unbondingPeriod(), newPeriod);
    }

    function testSetUnbondingPeriodZeroReverts() public {
        vm.expectRevert(InvalidUnbondingPeriod.selector);
        stake.setUnbondingPeriod(0);
    }
}
