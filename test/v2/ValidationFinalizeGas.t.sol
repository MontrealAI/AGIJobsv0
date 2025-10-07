// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {ValidationModule, InvalidCommitWindow} from "../../contracts/v2/ValidationModule.sol";
import {StakeManager} from "../../contracts/v2/StakeManager.sol";
import {IdentityRegistryToggle} from "../../contracts/v2/mocks/IdentityRegistryToggle.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {MockJobRegistry} from "../../contracts/legacy/MockV2.sol";
import {IJobRegistry} from "../../contracts/v2/interfaces/IJobRegistry.sol";
import {IStakeManager} from "../../contracts/v2/interfaces/IStakeManager.sol";
import {IIdentityRegistry} from "../../contracts/v2/interfaces/IIdentityRegistry.sol";
import {AGIALPHA} from "../../contracts/v2/Constants.sol";

contract ValidationFinalizeGas is Test {
    ValidationModule validation;
    StakeManager stake;
    IdentityRegistryToggle identity;
    AGIALPHAToken token;
    MockJobRegistry jobRegistry;

    bytes32 constant burnTxHash = keccak256("burn");

    address employer = address(0xE);
    address agent = address(0xA);
    address[3] validators;
    address treasury = address(0xCAFE);

    function setUp() public {
        // deploy AGIALPHA token mock
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        token = AGIALPHAToken(payable(AGIALPHA));

        stake = new StakeManager(1e18, 0, 10_000, treasury, address(0), address(0), address(this));
        jobRegistry = new MockJobRegistry();
        stake.setJobRegistry(address(jobRegistry));

        identity = new IdentityRegistryToggle();

        // three validators
        validators[0] = address(0x1);
        validators[1] = address(0x2);
        validators[2] = address(0x3);

        for (uint256 i; i < 3; ++i) {
            identity.addAdditionalValidator(validators[i]);
            token.mint(validators[i], 1e18);
            vm.startPrank(validators[i]);
            token.approve(address(stake), 1e18);
            stake.depositStake(StakeManager.Role.Validator, 1e18);
            vm.stopPrank();
        }

        address[] memory pool = new address[](3);
        for (uint256 i; i < 3; ++i) {
            pool[i] = validators[i];
        }

        validation = new ValidationModule(
            IJobRegistry(address(jobRegistry)),
            IStakeManager(address(stake)),
            1,
            1,
            3,
            10,
            pool
        );
        validation.setIdentityRegistry(IIdentityRegistry(address(identity)));
        stake.setValidationModule(address(validation));
    }

    function _prepareJob() internal returns (uint256 jobId) {
        jobId = 1;
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
        validation.selectValidators(jobId, 0);
    }

    function _commitAndReveal(uint256 jobId) internal {
        for (uint256 i; i < validators.length; ++i) {
            address val = validators[i];
            bytes32 salt = bytes32(uint256(i + 1));
            uint256 nonce = validation.jobNonce(jobId);
            bytes32 commitHash = keccak256(
                abi.encodePacked(jobId, nonce, true, burnTxHash, salt, bytes32(0))
            );
            vm.prank(val);
            validation.commitValidation(jobId, commitHash, "", new bytes32[](0));
            vm.warp(block.timestamp + 2);
            vm.prank(val);
            validation.revealValidation(jobId, true, burnTxHash, salt, "", new bytes32[](0));
        }
    }

    function testFinalizeGas() public {
        uint256 jobId = _prepareJob();
        vm.pauseGasMetering();
        _commitAndReveal(jobId);
        vm.resumeGasMetering();
        validation.finalize(jobId);
    }

    function testForceFinalizeGas() public {
        uint256 jobId = _prepareJob();
        // skip reveals
        vm.warp(block.timestamp + 1 + 1 + validation.forceFinalizeGrace() + 1);
        vm.pauseGasMetering();
        vm.resumeGasMetering();
        validation.forceFinalize(jobId);
    }

    function testSetCommitWindowEmitsAndUpdates() public {
        uint256 newWindow = validation.commitWindow() + 5;
        uint256 reveal = validation.revealWindow();
        vm.expectEmit(false, false, false, true, address(validation));
        emit ValidationModule.TimingUpdated(newWindow, reveal);
        vm.expectEmit(false, false, false, true, address(validation));
        emit ValidationModule.CommitWindowUpdated(newWindow);
        validation.setCommitWindow(newWindow);
        assertEq(validation.commitWindow(), newWindow, "commit window not updated");
    }

    function testSetCommitWindowZeroReverts() public {
        vm.expectRevert(InvalidCommitWindow.selector);
        validation.setCommitWindow(0);
    }
}

