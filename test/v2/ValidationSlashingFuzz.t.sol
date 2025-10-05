// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {ValidationModule} from "../../contracts/v2/ValidationModule.sol";
import {StakeManager} from "../../contracts/v2/StakeManager.sol";
import {IdentityRegistryToggle} from "../../contracts/v2/mocks/IdentityRegistryToggle.sol";
import {AGIALPHAToken} from "../../contracts/test/AGIALPHAToken.sol";
import {IJobRegistry} from "../../contracts/v2/interfaces/IJobRegistry.sol";
import {IStakeManager} from "../../contracts/v2/interfaces/IStakeManager.sol";
import {IIdentityRegistry} from "../../contracts/v2/interfaces/IIdentityRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockJobRegistry} from "../../contracts/legacy/MockV2.sol";
import {AGIALPHA} from "../../contracts/v2/Constants.sol";
import {ITaxPolicy} from "../../contracts/v2/interfaces/ITaxPolicy.sol";

contract ValidationSlashingFuzz is Test {
    ValidationModule validation;
    StakeManager stake;
    IdentityRegistryToggle identity;
    AGIALPHAToken token;
    MockJobRegistry jobRegistry;

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
        validation = new ValidationModule(
            IJobRegistry(address(0)),
            IStakeManager(address(stake)),
            1,
            1,
            3,
            10,
            new address[](0)
        );
        validation.setIdentityRegistry(IIdentityRegistry(address(identity)));
    }

    function taxPolicy() external pure returns (ITaxPolicy) {
        return ITaxPolicy(address(0));
    }

    function testFuzz_slashingPercentage(uint8 pct) public {
        pct = uint8(bound(uint256(pct), 0, 100));
        validation.setValidatorSlashingPct(pct);
        assertEq(validation.validatorSlashingPercentage(), pct);
    }

    function testFuzz_validatorPool(uint8 size) public {
        size = uint8(bound(uint256(size), 0, 10));
        address[] memory pool = new address[](size);
        for (uint8 i; i < size; i++) {
            address val = address(uint160(uint256(keccak256(abi.encode(i + 1)))));
            pool[i] = val;
            identity.addAdditionalValidator(val);
            token.mint(val, 1e18);
            vm.prank(val);
            token.approve(address(stake), 1e18);
            vm.prank(val);
            stake.depositStake(StakeManager.Role.Validator, 1e18);
        }
        string[] memory subs = new string[](size);
        for (uint8 i; i < size; i++) {
            subs[i] = "validator";
        }
        validation.setValidatorSubdomains(pool, subs);
        validation.setValidatorPool(pool);
        for (uint8 i; i < size; i++) {
            assertEq(validation.validatorPool(i), pool[i]);
        }
    }
}

