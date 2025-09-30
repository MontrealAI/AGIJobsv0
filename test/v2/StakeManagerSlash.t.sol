// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {StakeManager} from "../../contracts/v2/StakeManager.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {AGIALPHA} from "../../contracts/v2/Constants.sol";

contract StakeManagerHarness is StakeManager {
    constructor(
        uint256 _minStake,
        uint256 _employerPct,
        uint256 _treasuryPct,
        address _treasury,
        address _jobRegistry,
        address _disputeModule,
        address _timelock
    ) StakeManager(_minStake, _employerPct, _treasuryPct, _treasury, _jobRegistry, _disputeModule, _timelock) {}

    function slashInternal(address user, Role role, uint256 amount, address recipient, address[] memory validators)
        external
    {
        _slash(user, role, amount, recipient, validators);
    }
}

contract StakeManagerSlashTest is Test {
    StakeManagerHarness stake;
    AGIALPHAToken token;

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        token = AGIALPHAToken(payable(AGIALPHA));
        stake = new StakeManagerHarness(1e18, 0, 100, address(1), address(this), address(this), address(this));
        stake.setValidatorRewardPct(10);
        stake.setValidatorSlashRewardPct(10);
    }

    function _depositValidator(address val) internal {
        token.mint(val, 1e18);
        vm.prank(val);
        token.approve(address(stake), 1e18);
        vm.prank(val);
        stake.depositStake(StakeManager.Role.Validator, 1e18);
    }

    function test_slash_limit() public {
        uint256 limit = stake.MAX_VALIDATORS();
        address[] memory validators = new address[](limit + 1);
        for (uint256 i; i < limit + 1; ++i) {
            address val = address(uint160(i + 1));
            validators[i] = val;
            _depositValidator(val);
        }
        address user = address(0x111);
        uint256 amount = 100e18;
        token.mint(user, amount);
        vm.prank(user);
        token.approve(address(stake), amount);
        vm.prank(user);
        stake.depositStake(StakeManager.Role.Validator, amount);

        vm.expectRevert("too many validators");
        stake.slashInternal(user, StakeManager.Role.Validator, amount, address(0), validators);
    }

    function test_slash_batched_distribution() public {
        uint256 limit = stake.MAX_VALIDATORS();
        uint256 n = limit + 5;
        address[] memory validators = new address[](n);
        for (uint256 i; i < n; ++i) {
            address val = address(uint160(i + 1));
            validators[i] = val;
            _depositValidator(val);
        }
        address user = address(0x222);
        uint256 amount = n * 1e18;
        token.mint(user, amount);
        vm.prank(user);
        token.approve(address(stake), amount);
        vm.prank(user);
        stake.depositStake(StakeManager.Role.Validator, amount);

        uint256[] memory beforeBal = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            beforeBal[i] = token.balanceOf(validators[i]);
        }

        vm.prank(address(this));
        stake.slash(user, StakeManager.Role.Validator, amount, address(0), validators);

        uint256 expected = (amount * stake.validatorSlashRewardPct()) / 100 / n;
        for (uint256 i; i < n; ++i) {
            uint256 gained = token.balanceOf(validators[i]) - beforeBal[i];
            assertEq(gained, expected);
        }
    }
}
