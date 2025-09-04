// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {PaymentRouter} from "../../contracts/v2/PaymentRouter.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";

contract PaymentRouterTest is Test {
    PaymentRouter router;
    AGIALPHAToken token;

    function setUp() public {
        token = new AGIALPHAToken();
        router = new PaymentRouter(address(this), token);
    }

    function testOnlyGovernanceCanSetToken() public {
        AGIALPHAToken other = new AGIALPHAToken();
        vm.prank(address(1));
        vm.expectRevert("governance only");
        router.setToken(address(other));
        router.setToken(address(other));
        assertEq(address(router.token()), address(other));
    }

    function testTransfer() public {
        token.mint(address(router), 100 ether);
        address to = address(0x1234);
        router.transfer(to, 10 ether);
        assertEq(token.balanceOf(to), 10 ether);
        assertEq(token.balanceOf(address(router)), 90 ether);
    }
}

