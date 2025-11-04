// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {AttestationRegistry, ZeroAddress} from "../../contracts/v2/AttestationRegistry.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IdentityRegistry} from "../../contracts/v2/IdentityRegistry.sol";
import {IENS} from "../../contracts/v2/interfaces/IENS.sol";
import {INameWrapper} from "../../contracts/v2/interfaces/INameWrapper.sol";
import {IReputationEngine} from "../../contracts/v2/interfaces/IReputationEngine.sol";
import {MockENS} from "../../contracts/legacy/MockENS.sol";
import {MockNameWrapper} from "../../contracts/legacy/MockNameWrapper.sol";

contract AttestationRegistryTest is Test {
    AttestationRegistry attest;
    IdentityRegistry identity;
    MockENS ens;
    MockNameWrapper wrapper;
    address owner = address(0x1);
    address agent = address(0x2);
    address validator = address(0x3);
    bytes32 agentRoot = keccak256("agent.root");
    bytes32 validatorRoot = keccak256("validator.root");

    function setUp() public {
        ens = new MockENS();
        wrapper = new MockNameWrapper();
        attest = new AttestationRegistry(IENS(address(ens)), INameWrapper(address(wrapper)));
        identity = new IdentityRegistry(
            IENS(address(ens)),
            INameWrapper(address(wrapper)),
            IReputationEngine(address(0)),
            bytes32(0),
            bytes32(0)
        );
        identity.setAttestationRegistry(address(attest));
        identity.setAgentRootNode(agentRoot);
        identity.setClubRootNode(validatorRoot);
    }

    function _node(bytes32 root, string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(root, keccak256(bytes(label))));
    }

    function testAttestAndRevoke() public {
        bytes32 node = _node(agentRoot, "alice");
        wrapper.setOwner(uint256(node), owner);
        vm.prank(owner);
        attest.attest(node, AttestationRegistry.Role.Agent, agent);
        assertTrue(attest.isAttested(node, AttestationRegistry.Role.Agent, agent));
        vm.prank(owner);
        attest.revoke(node, AttestationRegistry.Role.Agent, agent);
        assertFalse(attest.isAttested(node, AttestationRegistry.Role.Agent, agent));
    }

    function testAttestZeroAddressReverts() public {
        bytes32 node = _node(agentRoot, "alice");
        wrapper.setOwner(uint256(node), owner);
        vm.expectRevert(ZeroAddress.selector);
        vm.prank(owner);
        attest.attest(node, AttestationRegistry.Role.Agent, address(0));
    }

    function testIdentityIntegration() public {
        bytes32 aNode = _node(agentRoot, "agent");
        wrapper.setOwner(uint256(aNode), owner);
        vm.prank(owner);
        attest.attest(aNode, AttestationRegistry.Role.Agent, agent);
        assertTrue(identity.isAuthorizedAgent(agent, "agent", new bytes32[](0)));

        bytes32 vNode = _node(validatorRoot, "validator");
        wrapper.setOwner(uint256(vNode), owner);
        vm.prank(owner);
        attest.attest(vNode, AttestationRegistry.Role.Validator, validator);
        assertTrue(identity.isAuthorizedValidator(validator, "validator", new bytes32[](0)));
    }

    function testSetENSUnauthorized() public {
        address caller = address(0xBEEF);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", caller)
        );
        vm.prank(caller);
        attest.setENS(address(ens));
    }

    function testSetNameWrapperUnauthorized() public {
        address caller = address(0xBEEF);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", caller)
        );
        vm.prank(caller);
        attest.setNameWrapper(address(wrapper));
    }

    function testPauseAndUnpause() public {
        bytes32 node = _node(agentRoot, "alice");
        wrapper.setOwner(uint256(node), owner);

        // Non-owners cannot pause or unpause.
        address caller = address(0xBEEF);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", caller)
        );
        vm.prank(caller);
        attest.pause();

        vm.expectRevert("Pausable: paused");
        attest.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(owner);
        attest.attest(node, AttestationRegistry.Role.Agent, agent);

        attest.unpause();
        vm.prank(owner);
        attest.attest(node, AttestationRegistry.Role.Agent, agent);

        attest.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(owner);
        attest.revoke(node, AttestationRegistry.Role.Agent, agent);

        attest.unpause();
        vm.prank(owner);
        attest.revoke(node, AttestationRegistry.Role.Agent, agent);
        assertFalse(attest.isAttested(node, AttestationRegistry.Role.Agent, agent));

        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", caller)
        );
        vm.prank(caller);
        attest.unpause();
    }
}

