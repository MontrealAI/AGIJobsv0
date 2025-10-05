// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {StakeManager, InvalidPercentage} from "../../contracts/v2/StakeManager.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {AGIALPHA} from "../../contracts/v2/Constants.sol";
import {ITaxPolicy} from "../../contracts/v2/interfaces/ITaxPolicy.sol";

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
        vm.store(AGIALPHA, bytes32(uint256(5)), bytes32(uint256(uint160(address(this)))));
        token = AGIALPHAToken(payable(AGIALPHA));
        stake = new StakeManagerHarness(1e18, 0, 10_000, address(0), address(this), address(this), address(this));
        stake.setSlashingPercentages(0, 9_000);
        stake.setValidatorRewardPct(10);
        stake.setValidatorSlashRewardPct(1_000);
        vm.prank(address(stake));
        token.acceptTerms();
    }

    function taxPolicy() external pure returns (ITaxPolicy) {
        return ITaxPolicy(address(0));
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

        uint256 expected = (amount * stake.validatorSlashRewardPct()) / 10_000 / n;
        for (uint256 i; i < n; ++i) {
            uint256 gained = token.balanceOf(validators[i]) - beforeBal[i];
            assertEq(gained, expected);
        }
    }

    function testSetSlashPercentsEmitsTelemetry() public {
        uint16 employer = 5_000;
        uint16 treasury = 3_000;
        uint16 validators = 1_000;
        uint16 operators = 500;
        uint16 burn = 500;

        vm.expectEmit(false, false, false, true);
        emit StakeManager.SlashDistributionUpdated(employer, treasury, operators, validators);
        vm.expectEmit(false, false, false, true);
        emit StakeManager.SlashPercentsUpdated(employer, treasury, validators, operators, burn);

        stake.setSlashPercents(employer, treasury, validators, operators, burn);

        assertEq(stake.employerSlashPct(), employer);
        assertEq(stake.treasurySlashPct(), treasury);
        assertEq(stake.validatorSlashRewardPct(), validators);
        assertEq(stake.operatorSlashPct(), operators);
        assertEq(stake.burnSlashPct(), burn);
    }

    function testSetSlashPercentsRevertsWhenTotalExceedsBps() public {
        vm.expectRevert(InvalidPercentage.selector);
        stake.setSlashPercents(6_000, 3_000, 1_500, 0, 1_000);
    }
}
