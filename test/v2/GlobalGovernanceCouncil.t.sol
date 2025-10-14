// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {GlobalGovernanceCouncil} from "../../contracts/v2/governance/GlobalGovernanceCouncil.sol";

contract GlobalGovernanceCouncilTest is Test {
    GlobalGovernanceCouncil internal council;
    address internal owner = address(0xA11CE);
    address internal nationGovernorA = address(0xBEEF);
    address internal nationGovernorB = address(0xC0FFEE);
    bytes32 internal nationA = keccak256("NATION_A");
    bytes32 internal nationB = keccak256("NATION_B");
    bytes32 internal mandate = keccak256("MANDATE");

    function setUp() public {
        vm.prank(owner);
        council = new GlobalGovernanceCouncil(owner, bytes32("PAUSER_ROLE"));
        vm.prank(owner);
        council.registerNation(nationA, nationGovernorA, 2, "uri-a");
        vm.prank(owner);
        council.registerNation(nationB, nationGovernorB, 3, "uri-b");
        vm.prank(owner);
        council.createMandate(mandate, 4, 0, 0, "uri-m");
    }

    function testOwnerCanUpdateNation() public {
        vm.prank(owner);
        council.updateNation(nationA, nationGovernorA, 5, true, "updated");
        GlobalGovernanceCouncil.NationConfig memory info = council.getNation(nationA);
        string memory metadata = info.metadataURI;
        uint96 weight = info.votingWeight;
        bool active = info.active;
        assertEq(weight, 5);
        assertTrue(active);
        assertEq(metadata, "updated");
    }

    function testVotingFlow() public {
        vm.prank(nationGovernorA);
        council.recordNationVote(mandate, nationA, true, "vote-a");
        vm.prank(nationGovernorB);
        council.recordNationVote(mandate, nationB, false, "vote-b");

        GlobalGovernanceCouncil.Mandate memory info = council.getMandate(mandate);
        assertEq(info.supportWeight, 2);
        assertEq(info.againstWeight, 3);

        vm.prank(nationGovernorB);
        council.recordNationVote(mandate, nationB, true, "vote-b2");
        info = council.getMandate(mandate);
        assertEq(info.supportWeight, 5);
        assertEq(info.againstWeight, 0);
        assertTrue(council.hasMandateReachedQuorum(mandate));
    }

    function testPauseFlow() public {
        vm.prank(owner);
        council.pause();
        vm.prank(nationGovernorA);
        vm.expectRevert("Pausable: paused");
        council.recordNationVote(mandate, nationA, true, "vote");

        vm.prank(owner);
        council.unpause();
        vm.prank(nationGovernorA);
        council.recordNationVote(mandate, nationA, true, "vote");
    }
}
