// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {StakeManager, TokenNotBurnable} from "../../contracts/v2/StakeManager.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {AGIALPHA, BURN_ADDRESS} from "../../contracts/v2/Constants.sol";

contract StakeManagerBurnHarness is StakeManager {
    constructor(address gov)
        StakeManager(1e18, 0, 10_000, address(0), address(0), address(0), gov)
    {}

    function exposedBurn(uint256 amt) external {
        _burnToken(bytes32(0), amt);
    }
}

contract NoBurnToken {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
        totalSupply += amt;
    }
}

contract StakeManagerBurnTest is Test {
    StakeManagerBurnHarness stake;
    AGIALPHAToken token;

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        // set owner slot to this contract for minting
        vm.store(AGIALPHA, bytes32(uint256(5)), bytes32(uint256(uint160(address(this)))));
        token = AGIALPHAToken(payable(AGIALPHA));
        stake = new StakeManagerBurnHarness(address(this));
        stake.setBurnPct(1);
    }

    function testBurnTokenDecreasesSupply() public {
        token.mint(address(stake), 100e18);
        uint256 supplyBefore = token.totalSupply();
        stake.exposedBurn(10e18);
        assertEq(token.totalSupply(), supplyBefore - 10e18);
        assertEq(token.balanceOf(address(stake)), 90e18);
    }

    function testBurnTokenRevertsWithoutBurnFunction() public {
        NoBurnToken nb = new NoBurnToken();
        vm.etch(AGIALPHA, address(nb).code);
        vm.expectRevert(TokenNotBurnable.selector);
        stake.exposedBurn(1);
    }

    function invariant_burnAddressZeroWhenBurnPctPositive() public {
        if (stake.burnPct() > 0) {
            assertEq(BURN_ADDRESS, address(0));
        }
    }

    function testSetFeePctEmitsWhenValueChanges() public {
        uint256 target = 12;
        vm.expectEmit(false, false, false, true, address(stake));
        emit StakeManager.FeePctUpdated(target);
        stake.setFeePct(target);
        assertEq(stake.feePct(), target, "fee pct not updated");
    }

    function testSetFeePctNoEmitWhenUnchanged() public {
        uint256 current = stake.feePct();
        vm.recordLogs();
        stake.setFeePct(current);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0, "unexpected events emitted");
        assertEq(stake.feePct(), current, "fee pct changed unexpectedly");
    }

    function testSetMinStakeEmitsAndUpdates() public {
        uint256 target = 2e18;
        vm.expectEmit(false, false, false, true, address(stake));
        emit StakeManager.MinStakeUpdated(target);
        stake.setMinStake(target);
        assertEq(stake.minStake(), target, "min stake not updated");
    }

    function testSetMinStakeZeroReverts() public {
        vm.expectRevert(StakeManager.InvalidMinStake.selector);
        stake.setMinStake(0);
    }
}

