// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {StakeManager} from "../../contracts/v2/StakeManager.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AGIALPHA} from "../../contracts/v2/Constants.sol";

contract StakeManagerFuzz is Test {
    StakeManager stake;
    AGIALPHAToken token;

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        token = AGIALPHAToken(AGIALPHA);
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
        vm.expectRevert("max stake");
        stake.depositStake(StakeManager.Role.Agent, second);
    }
}
