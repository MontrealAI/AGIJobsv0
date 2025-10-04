// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {IdentityRegistry, ZeroAddress} from "../../contracts/v2/IdentityRegistry.sol";

contract IdentityRegistryConfigTest is Test {
    IdentityRegistry identity;

    function setUp() public {
        identity = new IdentityRegistry(
            IENS(address(0)),
            INameWrapper(address(0)),
            IReputationEngine(address(0)),
            bytes32(0),
            bytes32(0)
        );
    }

    function testSetENSEmitsAndUpdatesStorage() public {
        address newEns = address(0x1234);
        vm.expectEmit(true, false, false, true, address(identity));
        emit IdentityRegistry.ENSUpdated(newEns);
        identity.setENS(newEns);
        assertEq(address(identity.ens()), newEns, "ens not updated");
    }

    function testSetENSZeroReverts() public {
        vm.expectRevert(ZeroAddress.selector);
        identity.setENS(address(0));
    }
}
