// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {StakeManager, MaxStakeExceeded, BelowMinimumStake, InvalidParams} from "../../contracts/v2/StakeManager.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AGIALPHA} from "../../contracts/v2/Constants.sol";

contract StakeManagerFuzz is Test {
    StakeManager stake;
    AGIALPHAToken token;

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        token = AGIALPHAToken(payable(AGIALPHA));
        stake = new StakeManager(1e18, 50, 50, address(this), address(this), address(this), address(this));
    }

    function _deposit(address user, uint256 amount, StakeManager.Role role) internal {
        token.mint(user, amount);
        vm.prank(user);
        token.approve(address(stake), amount);
        vm.prank(user);
        stake.depositStake(role, amount);
    }

    function testFuzz_slashWithinStake(uint256 deposit, uint256 slash) public {
        vm.assume(deposit >= stake.minStake() && deposit < 1e24);
        vm.assume(slash <= deposit);
        _deposit(address(1), deposit, StakeManager.Role.Validator);
        vm.prank(address(this));
        stake.slash(address(1), StakeManager.Role.Validator, slash, address(this));
        assertEq(stake.stakeOf(address(1), StakeManager.Role.Validator), deposit - slash);
    }

    function testFuzz_maxStakePerAddress(uint256 limit, uint256 first, uint256 second) public {
        vm.assume(limit >= stake.minStake());
        vm.assume(first >= stake.minStake());
        vm.assume(second >= stake.minStake());
        stake.setMaxStakePerAddress(limit);
        vm.assume(first <= limit);
        _deposit(address(2), first, StakeManager.Role.Agent);
        uint256 remaining = limit - first;
        vm.assume(second > remaining);
        token.mint(address(2), second);
        vm.prank(address(2));
        token.approve(address(stake), second);
        vm.prank(address(2));
        vm.expectRevert(MaxStakeExceeded.selector);
        stake.depositStake(StakeManager.Role.Agent, second);
    }

    function testFuzz_setStakeRecommendations_reverts(uint256 minRec, uint256 maxRec) public {
        vm.assume(minRec > 0);
        vm.assume(maxRec > 0);
        vm.assume(maxRec < minRec);
        vm.expectRevert(InvalidParams.selector);
        stake.setStakeRecommendations(minRec, maxRec);
    }

    function testFuzz_setStakeRecommendations_enforcesBounds(
        uint256 minRec,
        uint256 maxRec
    ) public {
        vm.assume(minRec >= stake.minStake());
        vm.assume(maxRec > minRec);
        vm.assume(maxRec < 1e24);
        stake.setStakeRecommendations(minRec, maxRec);

        // below min should revert
        uint256 below = minRec - 1;
        token.mint(address(3), below);
        vm.prank(address(3));
        token.approve(address(stake), below);
        vm.prank(address(3));
        vm.expectRevert(BelowMinimumStake.selector);
        stake.depositStake(StakeManager.Role.Agent, below);

        // above max should revert
        uint256 above = maxRec + 1;
        token.mint(address(4), above);
        vm.prank(address(4));
        token.approve(address(stake), above);
        vm.prank(address(4));
        vm.expectRevert(MaxStakeExceeded.selector);
        stake.depositStake(StakeManager.Role.Agent, above);
    }
}
