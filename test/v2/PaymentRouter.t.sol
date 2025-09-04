// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {PaymentRouter} from "../../contracts/v2/PaymentRouter.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";

interface Vm {
    function prank(address) external;
}

contract PaymentRouterTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256('hevm cheat code')))));

    PaymentRouter router;
    AGIALPHAToken token1;
    AGIALPHAToken token2;
    address alice = address(0x1);
    address bob = address(0x2);

    function setUp() public {
        token1 = new AGIALPHAToken();
        token2 = new AGIALPHAToken();
        router = new PaymentRouter(address(token1), address(this));
        token1.mint(alice, 100e18);
        vm.prank(alice);
        token1.approve(address(router), type(uint256).max);
    }

    function testTransferFrom() public {
        vm.prank(alice);
        router.transferFrom(alice, bob, 10e18);
        require(token1.balanceOf(bob) == 10e18, "transfer");
    }

    function testTokenSwap() public {
        vm.prank(alice);
        router.transferFrom(alice, bob, 10e18);
        router.setToken(address(token2));
        token2.mint(alice, 50e18);
        vm.prank(alice);
        token2.approve(address(router), type(uint256).max);
        vm.prank(alice);
        router.transferFrom(alice, bob, 20e18);
        require(token2.balanceOf(bob) == 20e18, "swap");
    }

    function testOnlyGovernanceCanSetToken() public {
        vm.prank(alice);
        try router.setToken(address(token2)) {
            revert("allowed");
        } catch {
            // expected revert
        }
    }
}
