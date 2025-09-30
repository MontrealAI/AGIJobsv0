// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";

import {KernelStakeManager} from "../../../contracts/v2/kernel/StakeManager.sol";
import {MockERC20} from "../../../contracts/test/MockERC20.sol";

contract StakeManagerKernelTest is Test {
    KernelStakeManager internal stakeManager;
    MockERC20 internal token;

    address internal governance = address(0xA11CE);
    address internal operator = address(0xB0B);
    address internal alice = address(0xC0FFEE);
    address internal employer = address(0xE);

    function setUp() public {
        token = new MockERC20();
        stakeManager = new KernelStakeManager(token, governance);
        vm.prank(governance);
        stakeManager.setOperator(operator, true);
    }

    function _deposit(address from, address who, uint256 amount) internal {
        token.mint(from, amount);
        vm.prank(from);
        token.approve(address(stakeManager), amount);
        vm.prank(from);
        stakeManager.deposit(who, amount);
    }

    function testDepositAndWithdraw() public {
        _deposit(alice, alice, 10 ether);
        assertEq(stakeManager.stakeOf(alice), 10 ether);

        vm.prank(alice);
        stakeManager.withdraw(alice, 4 ether);
        assertEq(stakeManager.stakeOf(alice), 6 ether);
        assertEq(stakeManager.pendingWithdrawals(alice), 4 ether);

        vm.prank(alice);
        uint256 claimed = stakeManager.claim();
        assertEq(claimed, 4 ether);
        assertEq(token.balanceOf(alice), 4 ether);
    }

    function testOperatorCanDepositForUser() public {
        token.mint(operator, 5 ether);
        vm.prank(operator);
        token.approve(address(stakeManager), 5 ether);
        vm.prank(operator);
        stakeManager.deposit(alice, 5 ether);
        assertEq(stakeManager.stakeOf(alice), 5 ether);
    }

    function testSlashQueuesWithdrawalForBeneficiary() public {
        _deposit(alice, alice, 20 ether);
        vm.prank(operator);
        stakeManager.slash(alice, 2_000, employer, "policy_violation");

        assertEq(stakeManager.stakeOf(alice), 16 ether);
        assertEq(stakeManager.pendingWithdrawals(employer), 4 ether);

        vm.prank(employer);
        stakeManager.claim();
        assertEq(token.balanceOf(employer), 4 ether);
    }

    function testCannotOverSlash() public {
        _deposit(alice, alice, 1 ether);
        vm.expectRevert(KernelStakeManager.InvalidBps.selector);
        vm.prank(operator);
        stakeManager.slash(alice, 20_000, employer, "over");
    }
}
