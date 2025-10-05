// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {ValidationModule} from "../../contracts/v2/ValidationModule.sol";
import {StakeManager} from "../../contracts/v2/StakeManager.sol";
import {IdentityRegistryToggle} from "../../contracts/v2/mocks/IdentityRegistryToggle.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {MockJobRegistry} from "../../contracts/legacy/MockV2.sol";
import {IJobRegistry} from "../../contracts/v2/interfaces/IJobRegistry.sol";
import {IStakeManager} from "../../contracts/v2/interfaces/IStakeManager.sol";
import {IIdentityRegistry} from "../../contracts/v2/interfaces/IIdentityRegistry.sol";
import {AGIALPHA} from "../../contracts/v2/Constants.sol";
import {ITaxPolicy} from "../../contracts/v2/interfaces/ITaxPolicy.sol";

error PendingPenalty();
error InsufficientLocked();

contract ValidatorStakeLockTest is Test {
    ValidationModule internal validation;
    StakeManager internal stake;
    IdentityRegistryToggle internal identity;
    AGIALPHAToken internal token;
    MockJobRegistry internal jobRegistry;

    bytes32 internal constant burnTxHash = keccak256("burn");

    address internal employer = address(0xE);
    address internal agent = address(0xA);
    address[3] internal validators;

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        vm.store(AGIALPHA, bytes32(uint256(5)), bytes32(uint256(uint160(address(this)))));
        token = AGIALPHAToken(payable(AGIALPHA));

        stake = new StakeManager(1e18, 0, 10_000, address(0), address(0), address(0), address(this));
        stake.setMinStake(1);
        vm.prank(address(stake));
        token.acceptTerms();
        jobRegistry = new MockJobRegistry();
        stake.setJobRegistry(address(jobRegistry));

        identity = new IdentityRegistryToggle();

        validators[0] = address(0x1);
        validators[1] = address(0x2);
        validators[2] = address(0x3);

        for (uint256 i; i < validators.length; ++i) {
            address val = validators[i];
            identity.addAdditionalValidator(val);
            token.mint(val, 1e18);
            vm.startPrank(val);
            token.approve(address(stake), 1e18);
            stake.depositStake(StakeManager.Role.Validator, 1e18);
            vm.stopPrank();
        }

        address[] memory pool = new address[](validators.length);
        for (uint256 i; i < validators.length; ++i) {
            pool[i] = validators[i];
        }

        validation = new ValidationModule(
            IJobRegistry(address(jobRegistry)),
            IStakeManager(address(stake)),
            10,
            10,
            3,
            10,
            pool
        );
        validation.setIdentityRegistry(IIdentityRegistry(address(identity)));
        stake.setValidationModule(address(validation));
        string[] memory subs = new string[](validators.length);
        for (uint256 i; i < validators.length; ++i) {
            subs[i] = "validator";
        }
        validation.setValidatorSubdomains(pool, subs);
        for (uint256 i; i < validators.length; ++i) {
            string memory configured = validation.validatorSubdomains(validators[i]);
            require(bytes(configured).length != 0, "validator subdomain not set");
        }
    }

    function taxPolicy() external pure returns (ITaxPolicy) {
        return ITaxPolicy(address(0));
    }

    function _prepareJob(uint256 jobId) internal returns (address[] memory selected) {
        MockJobRegistry.LegacyJob memory job;
        job.employer = employer;
        job.agent = agent;
        job.reward = 0;
        job.stake = 0;
        job.success = false;
        job.status = IJobRegistry.Status.Submitted;
        jobRegistry.setJob(jobId, job);

        vm.prank(employer);
        jobRegistry.submitBurnReceipt(jobId, burnTxHash, 0, block.number);

        vm.prank(address(jobRegistry));
        validation.start(jobId, 0);
        vm.roll(block.number + 2);
        selected = validation.selectValidators(jobId, 0);
    }

    function _commitAndReveal(uint256 jobId) internal {
        string[] memory subs = new string[](validators.length);
        uint256 revealDeadline = validation.revealDeadline(jobId);
        uint256 commitDeadline;
        if (revealDeadline != 0) {
            uint256 window = validation.revealWindow();
            if (revealDeadline >= window) {
                commitDeadline = revealDeadline - window;
            }
        }

        for (uint256 i; i < validators.length; ++i) {
            address val = validators[i];
            bytes32 salt = bytes32(uint256(i + 1));
            uint256 nonce = validation.jobNonce(jobId);
            bytes32 commitHash = keccak256(
                abi.encodePacked(jobId, nonce, true, burnTxHash, salt, bytes32(0))
            );
            string memory subdomain = validation.validatorSubdomains(val);
            subs[i] = subdomain;
            vm.prank(val);
            validation.commitValidation(jobId, commitHash, subdomain, new bytes32[](0));
        }

        if (commitDeadline != 0 && block.timestamp <= commitDeadline) {
            vm.warp(commitDeadline + 1);
        } else {
            vm.warp(block.timestamp + validation.commitWindow() + 1);
        }

        for (uint256 i; i < validators.length; ++i) {
            address val = validators[i];
            bytes32 salt = bytes32(uint256(i + 1));
            vm.prank(val);
            validation.revealValidation(jobId, true, burnTxHash, salt, subs[i], new bytes32[](0));
        }

        if (revealDeadline != 0 && block.timestamp <= revealDeadline) {
            vm.warp(revealDeadline + 1);
        }
    }

    function testValidatorCannotFinalizeWithdrawalWhileAssigned() public {
        stake.setUnbondingPeriod(1 hours);
        address validator = validators[0];

        vm.prank(validator);
        stake.requestWithdraw(StakeManager.Role.Validator, 1e18);

        vm.warp(block.timestamp + stake.unbondingPeriod());

        uint256 jobId = 1;
        address[] memory selected = _prepareJob(jobId);
        assertEq(selected.length, validators.length);
        assertEq(stake.validatorModuleLockedStake(validator), 1e18);

        vm.prank(validator);
        vm.expectRevert(PendingPenalty.selector);
        stake.finalizeWithdraw(StakeManager.Role.Validator);

        _commitAndReveal(jobId);
        bool success = validation.finalize(jobId);
        assertTrue(success);

        assertEq(stake.validatorModuleLockedStake(validator), 0);

        uint256 beforeBal = token.balanceOf(validator);
        vm.prank(validator);
        stake.finalizeWithdraw(StakeManager.Role.Validator);
        assertEq(token.balanceOf(validator), beforeBal + 1e18);
    }

    function testValidatorWithdrawStakeRevertsDuringActiveJob() public {
        uint256 jobId = 11;
        address validator = validators[0];

        _prepareJob(jobId);
        assertEq(stake.validatorModuleLockedStake(validator), 1e18);

        vm.prank(validator);
        vm.expectRevert(InsufficientLocked.selector);
        stake.withdrawStake(StakeManager.Role.Validator, 1e18);

        _commitAndReveal(jobId);
        bool success = validation.finalize(jobId);
        assertTrue(success);
    }

    function testSlashingSucceedsWithShortUnbondingPeriod() public {
        stake.setUnbondingPeriod(1);
        address validator = validators[0];

        vm.prank(validator);
        stake.requestWithdraw(StakeManager.Role.Validator, 1e18);
        vm.warp(block.timestamp + 2);

        uint256 jobId = 2;
        _prepareJob(jobId);
        assertEq(stake.validatorModuleLockedStake(validator), 1e18);

        uint256 advance = validation.commitWindow() + validation.revealWindow() + validation.forceFinalizeGrace() + 1;
        vm.warp(block.timestamp + advance);
        validation.forceFinalize(jobId);

        uint256 expected = 1e18 - ((1e18 * validation.nonRevealPenaltyBps()) / 10_000);
        assertEq(stake.stakes(validator, StakeManager.Role.Validator), expected);
        assertEq(stake.validatorModuleLockedStake(validator), 0);
    }
}
