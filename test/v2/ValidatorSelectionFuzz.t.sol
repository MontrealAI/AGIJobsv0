// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {StakeManager} from "../../contracts/v2/StakeManager.sol";
import {ValidationModule} from "../../contracts/v2/ValidationModule.sol";
import {IdentityRegistryToggle} from "../../contracts/v2/mocks/IdentityRegistryToggle.sol";
import {IJobRegistry} from "../../contracts/v2/interfaces/IJobRegistry.sol";
import {IStakeManager} from "../../contracts/v2/interfaces/IStakeManager.sol";
import {IIdentityRegistry} from "../../contracts/v2/interfaces/IIdentityRegistry.sol";
import {AGIALPHAToken} from "../../contracts/v2/AGIALPHAToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ValidatorSelectionFuzz is Test {
    StakeManager stake;
    ValidationModule validation;
    IdentityRegistryToggle identity;
    AGIALPHAToken token;
    mapping(address => uint256) index;

    function setUp() public {
        token = new AGIALPHAToken();
        stake = new StakeManager(
            IERC20(address(token)),
            1e18,
            0,
            100,
            address(this),
            address(0),
            address(0),
            address(this)
        );
        identity = new IdentityRegistryToggle();
        validation = new ValidationModule(
            IJobRegistry(address(0)),
            IStakeManager(address(stake)),
            1,
            1,
            1,
            10,
            new address[](0)
        );
        validation.setIdentityRegistry(IIdentityRegistry(address(identity)));
    }

    function testFuzz_validatorSelection(uint8 poolSize, uint8 selectCount) public {
        vm.assume(poolSize > 0 && poolSize <= 10);
        vm.assume(selectCount > 0 && selectCount <= poolSize);
        address[] memory pool = new address[](poolSize);
        for (uint8 i; i < poolSize; i++) {
            address val = address(uint160(uint256(keccak256(abi.encode(i + 1)))));
            pool[i] = val;
            identity.addAdditionalValidator(val);
            token.mint(val, 1e18);
            vm.prank(val);
            token.approve(address(stake), 1e18);
            vm.prank(val);
            stake.depositStake(StakeManager.Role.Validator, 1e18);
        }
        validation.setValidatorPool(pool);
        validation.setValidatorsPerJob(selectCount);
        validation.setValidatorPoolSampleSize(selectCount);
        address[] memory selected = validation.selectValidators(1, 1);
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
            address[] memory sel = validation.selectValidators(j + 1, 1);
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
            address[] memory sel = validation.selectValidators(iterations + j + 1, 1);
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
            address[] memory sel = validation.selectValidators(j + 1, 1);
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
