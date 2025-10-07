// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {StakeManager} from "../../contracts/v2/StakeManager.sol";
import {ValidationModule} from "../../contracts/v2/ValidationModule.sol";
import {IdentityRegistryToggle} from "../../contracts/v2/mocks/IdentityRegistryToggle.sol";
import {IJobRegistry} from "../../contracts/v2/interfaces/IJobRegistry.sol";
import {IStakeManager} from "../../contracts/v2/interfaces/IStakeManager.sol";
import {IIdentityRegistry} from "../../contracts/v2/interfaces/IIdentityRegistry.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AGIALPHA} from "../../contracts/v2/Constants.sol";
import {MockJobRegistry} from "../../contracts/legacy/MockV2.sol";

contract ValidatorSelectionFuzz is Test {
    StakeManager stake;
    ValidationModule validation;
    IdentityRegistryToggle identity;
    AGIALPHAToken token;
    MockJobRegistry jobRegistry;
    mapping(address => uint256) index;

    address constant TREASURY = address(0xDEAD);
    address constant ENTROPY_HELPER = address(0xBEEF);

    function setUp() public {
        AGIALPHAToken impl = new AGIALPHAToken();
        vm.etch(AGIALPHA, address(impl).code);
        vm.store(AGIALPHA, bytes32(uint256(5)), bytes32(uint256(uint160(address(this)))));
        token = AGIALPHAToken(payable(AGIALPHA));
        stake = new StakeManager(
            1e18,
            0,
            10_000,
            TREASURY,
            address(0),
            address(0),
            address(this)
        );
        stake.setTreasuryAllowlist(TREASURY, true);
        vm.prank(address(stake));
        token.acceptTerms();
        jobRegistry = new MockJobRegistry();
        stake.setJobRegistry(address(jobRegistry));
        identity = new IdentityRegistryToggle();
        validation = new ValidationModule(
            IJobRegistry(address(jobRegistry)),
            IStakeManager(address(stake)),
            1,
            1,
            3,
            10,
            new address[](0)
        );
        validation.setIdentityRegistry(IIdentityRegistry(address(identity)));
        stake.setValidationModule(address(validation));
    }

    function _select(uint256 jobId, uint256 entropySeed)
        internal
        returns (address[] memory selected)
    {
        validation.selectValidators(jobId, entropySeed);
        vm.prank(ENTROPY_HELPER);
        validation.selectValidators(jobId, entropySeed + 1);
        vm.roll(block.number + 2);
        selected = validation.selectValidators(jobId, entropySeed + 2);
        validation.resetJobNonce(jobId);
        validation.resetSelection(jobId);
    }

    function testFuzz_validatorSelection(uint8 poolSize, uint8 selectCount) public {
        vm.assume(poolSize >= 3 && poolSize <= 10);
        vm.assume(selectCount >= 3 && selectCount <= poolSize);
        address[] memory pool = new address[](poolSize);
        for (uint8 i; i < poolSize; i++) {
            address val = address(uint160(uint256(keccak256(abi.encode(i + 1)))));
            pool[i] = val;
            identity.addAdditionalValidator(val);
            token.mint(val, 1e18);
            vm.prank(val);
            token.acceptTerms();
            vm.prank(val);
            token.approve(address(stake), 1e18);
            vm.prank(val);
            stake.depositStake(StakeManager.Role.Validator, 1e18);
        }
        validation.setValidatorPool(pool);
        validation.setValidatorsPerJob(selectCount);
        validation.setValidatorPoolSampleSize(selectCount);
        address[] memory selected = _select(1, 1);
        assertEq(selected.length, selectCount);
        for (uint256 i; i < selected.length; i++) {
            for (uint256 j = i + 1; j < selected.length; j++) {
                assertTrue(selected[i] != selected[j]);
            }
        }
    }

    function test_uniform_selection_probability_independent_of_order() public {
        uint256 poolSize = 10;
        uint256 selectCount = 3;
        uint256 sample = 5;
        address[] memory pool = new address[](poolSize);
        for (uint256 i; i < poolSize; i++) {
            address val = address(uint160(uint256(keccak256(abi.encode(i + 1)))));
            pool[i] = val;
            index[val] = i;
            identity.addAdditionalValidator(val);
            token.mint(val, 1e18);
            vm.prank(val);
            token.acceptTerms();
            vm.prank(val);
            token.approve(address(stake), 1e18);
            vm.prank(val);
            stake.depositStake(StakeManager.Role.Validator, 1e18);
        }
        validation.setValidatorsPerJob(selectCount);
        validation.setValidatorPoolSampleSize(sample);
        validation.setValidatorPool(pool);

        uint256 iterations = 100;
        uint256[] memory counts = new uint256[](poolSize);
        for (uint256 j; j < iterations; j++) {
            vm.roll(block.number + 1);
            address[] memory sel = _select(j + 1, 1);
            for (uint256 k; k < sel.length; k++) {
                counts[index[sel[k]]] += 1;
            }
        }

        address[] memory reversed = new address[](poolSize);
        for (uint256 i; i < poolSize; i++) {
            reversed[i] = pool[poolSize - 1 - i];
        }
        validation.setValidatorPool(reversed);

        uint256[] memory countsRev = new uint256[](poolSize);
        for (uint256 j; j < iterations; j++) {
            vm.roll(block.number + 1);
            address[] memory sel = _select(iterations + j + 1, 1);
            for (uint256 k; k < sel.length; k++) {
                countsRev[index[sel[k]]] += 1;
            }
        }

        for (uint256 i; i < poolSize; i++) {
            uint256 a = counts[i];
            uint256 b = countsRev[i];
            uint256 diff = a > b ? a - b : b - a;
            assertLt(diff, iterations / 5);
        }
    }

    function test_uniform_distribution_large_pool() public {
        uint256 poolSize = 200;
        uint256 selectCount = 5;
        uint256 sample = 50;
        address[] memory pool = new address[](poolSize);
        for (uint256 i; i < poolSize; i++) {
            address val = address(uint160(uint256(keccak256(abi.encode(i + 1)))));
            pool[i] = val;
            index[val] = i;
            identity.addAdditionalValidator(val);
            token.mint(val, 1e18);
            vm.prank(val);
            token.acceptTerms();
            vm.prank(val);
            token.approve(address(stake), 1e18);
            vm.prank(val);
            stake.depositStake(StakeManager.Role.Validator, 1e18);
        }
        validation.setValidatorsPerJob(selectCount);
        validation.setValidatorPoolSampleSize(sample);
        validation.setValidatorPool(pool);

        uint256 iterations = 400;
        uint256[] memory counts = new uint256[](poolSize);
        for (uint256 j; j < iterations; j++) {
            vm.roll(block.number + 1);
            address[] memory sel = _select(j + 1, 1);
            for (uint256 k; k < sel.length; k++) {
                counts[index[sel[k]]] += 1;
            }
        }

        uint256 expected = (iterations * selectCount) / poolSize;
        for (uint256 i; i < poolSize; i++) {
            uint256 a = counts[i];
            uint256 diff = a > expected ? a - expected : expected - a;
            assertLt(diff, expected);
        }
    }
}
