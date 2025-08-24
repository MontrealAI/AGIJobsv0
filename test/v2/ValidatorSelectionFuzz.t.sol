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

    function setUp() public {
        token = new AGIALPHAToken();
        stake = new StakeManager(IERC20(address(token)), 1e6, 0, 100, address(this), address(0), address(0));
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
            token.mint(val, 1e6);
            vm.prank(val);
            token.approve(address(stake), 1e6);
            vm.prank(val);
            stake.depositStake(StakeManager.Role.Validator, 1e6);
        }
        validation.setValidatorPool(pool);
        validation.setValidatorsPerJob(selectCount);
        address[] memory selected = validation.selectValidators(1);
        assertEq(selected.length, selectCount);
        for (uint256 i; i < selected.length; i++) {
            for (uint256 j = i + 1; j < selected.length; j++) {
                assertTrue(selected[i] != selected[j]);
            }
        }
    }
}
