// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";

import {Phase8UniversalValueManager} from "../../contracts/v2/Phase8UniversalValueManager.sol";
import {Phase6MockSystemPause} from "../../contracts/v2/mocks/Phase6MockSystemPause.sol";

contract Phase8UniversalValueManagerTest is Test {
    Phase8UniversalValueManager internal manager;
    Phase6MockSystemPause internal pauseHarness;

    address internal constant GOVERNANCE = address(0xA110);
    address internal constant TREASURY = address(0xA120);
    address internal constant UNIVERSAL_VAULT = address(0xA130);
    address internal constant UPGRADE_COORDINATOR = address(0xA140);
    address internal constant VALIDATOR_REGISTRY = address(0xA150);
    address internal constant MISSION_CONTROL = address(0xA160);
    address internal constant KNOWLEDGE_GRAPH = address(0xA170);
    address internal constant ORCHESTRATOR = address(0xA180);
    address internal constant CAPITAL_VAULT = address(0xA190);
    address internal constant VALIDATOR_MODULE = address(0xA1A0);
    address internal constant POLICY_KERNEL = address(0xA1B0);
    address internal constant SENTINEL_AGENT = address(0xA1C0);
    address internal constant STREAM_VAULT = address(0xA1D0);

    function setUp() public {
        manager = new Phase8UniversalValueManager(GOVERNANCE);
        pauseHarness = new Phase6MockSystemPause();

        Phase8UniversalValueManager.GlobalParameters memory globals = Phase8UniversalValueManager.GlobalParameters({
            treasury: TREASURY,
            universalVault: UNIVERSAL_VAULT,
            upgradeCoordinator: UPGRADE_COORDINATOR,
            validatorRegistry: VALIDATOR_REGISTRY,
            missionControl: MISSION_CONTROL,
            knowledgeGraph: KNOWLEDGE_GRAPH,
            heartbeatSeconds: 600,
            guardianReviewWindow: 900,
            maxDrawdownBps: 3500,
            manifestoURI: "ipfs://phase8/manifest/universal.json"
        });

        vm.prank(GOVERNANCE);
        manager.setGlobalParameters(globals);

        vm.prank(GOVERNANCE);
        manager.setSystemPause(address(pauseHarness));
    }

    function testLifecycleAndGuards() public {
        Phase8UniversalValueManager.ValueDomain memory domain = Phase8UniversalValueManager.ValueDomain({
            slug: "planetary-finance",
            name: "Planetary Finance Mesh",
            metadataURI: "ipfs://phase8/domains/planetary-finance.json",
            orchestrator: ORCHESTRATOR,
            capitalVault: CAPITAL_VAULT,
            validatorModule: VALIDATOR_MODULE,
            policyKernel: POLICY_KERNEL,
            heartbeatSeconds: 300,
            tvlLimit: 1_000_000 ether,
            autonomyLevelBps: 7200,
            active: true
        });

        vm.startPrank(GOVERNANCE);
        bytes32 domainId = manager.registerDomain(domain);

        vm.expectRevert(abi.encodeWithSelector(Phase8UniversalValueManager.DuplicateDomain.selector, domainId));
        manager.registerDomain(domain);
        vm.stopPrank();

        Phase8UniversalValueManager.ValueDomain memory storedDomain = manager.getDomain(domainId);
        assertEq(storedDomain.metadataURI, domain.metadataURI);
        assertEq(storedDomain.orchestrator, ORCHESTRATOR);

        Phase8UniversalValueManager.ValueDomain memory updatedDomain = domain;
        updatedDomain.metadataURI = "ipfs://phase8/domains/planetary-finance-v2.json";
        updatedDomain.heartbeatSeconds = 420;
        updatedDomain.tvlLimit = 1_500_000 ether;
        updatedDomain.autonomyLevelBps = 8000;
        updatedDomain.active = false;

        vm.prank(GOVERNANCE);
        manager.updateDomain(domainId, updatedDomain);

        vm.prank(GOVERNANCE);
        manager.configureDomainLimits(domainId, updatedDomain.tvlLimit, updatedDomain.autonomyLevelBps, 480);

        Phase8UniversalValueManager.ValueDomain memory configuredDomain = manager.getDomain(domainId);
        assertEq(configuredDomain.heartbeatSeconds, 480);
        assertEq(configuredDomain.tvlLimit, updatedDomain.tvlLimit);

        vm.prank(GOVERNANCE);
        manager.setDomainStatus(domainId, false);
        Phase8UniversalValueManager.ValueDomain memory inactiveDomain = manager.getDomain(domainId);
        assertFalse(inactiveDomain.active);

        Phase8UniversalValueManager.SentinelProfile memory sentinel = Phase8UniversalValueManager.SentinelProfile({
            slug: "solar-shield",
            name: "Solar Shield Guardian",
            uri: "ipfs://phase8/sentinels/solar-shield.json",
            agent: SENTINEL_AGENT,
            coverageSeconds: 60,
            sensitivityBps: 250,
            active: true
        });

        vm.prank(GOVERNANCE);
        bytes32 sentinelId = manager.registerSentinel(sentinel);

        bytes32[] memory sentinelDomains = new bytes32[](1);
        sentinelDomains[0] = domainId;

        vm.prank(GOVERNANCE);
        manager.setSentinelDomains(sentinelId, sentinelDomains);

        vm.expectRevert(abi.encodeWithSelector(Phase8UniversalValueManager.DuplicateBinding.selector, domainId));
        bytes32[] memory duplicateSentinelDomains = new bytes32[](2);
        duplicateSentinelDomains[0] = domainId;
        duplicateSentinelDomains[1] = domainId;
        vm.prank(GOVERNANCE);
        manager.setSentinelDomains(sentinelId, duplicateSentinelDomains);

        bytes32 unknownDomainId = bytes32(uint256(0xBEEF));
        vm.expectRevert(abi.encodeWithSelector(Phase8UniversalValueManager.UnknownDomain.selector, unknownDomainId));
        bytes32[] memory missingDomain = new bytes32[](1);
        missingDomain[0] = unknownDomainId;
        vm.prank(GOVERNANCE);
        manager.setSentinelDomains(sentinelId, missingDomain);

        Phase8UniversalValueManager.SentinelProfile memory sentinelUpdate = sentinel;
        sentinelUpdate.coverageSeconds = 90;
        sentinelUpdate.sensitivityBps = 500;
        sentinelUpdate.active = false;

        vm.prank(GOVERNANCE);
        manager.updateSentinel(sentinelId, sentinelUpdate);

        vm.prank(GOVERNANCE);
        manager.setSentinelStatus(sentinelId, true);
        Phase8UniversalValueManager.SentinelProfile memory sentinelState = manager.listSentinels()[0].profile;
        assertTrue(sentinelState.active);

        Phase8UniversalValueManager.CapitalStream memory stream = Phase8UniversalValueManager.CapitalStream({
            slug: "climate-stabilization",
            name: "Climate Stabilization Fund",
            uri: "ipfs://phase8/streams/climate.json",
            vault: STREAM_VAULT,
            annualBudget: 500_000_000e6,
            expansionBps: 1_200,
            active: true
        });

        vm.prank(GOVERNANCE);
        bytes32 streamId = manager.registerCapitalStream(stream);

        bytes32[] memory streamDomains = new bytes32[](1);
        streamDomains[0] = domainId;

        vm.prank(GOVERNANCE);
        manager.setCapitalStreamDomains(streamId, streamDomains);

        vm.expectRevert(abi.encodeWithSelector(Phase8UniversalValueManager.DuplicateBinding.selector, domainId));
        bytes32[] memory duplicateStreamDomains = new bytes32[](2);
        duplicateStreamDomains[0] = domainId;
        duplicateStreamDomains[1] = domainId;
        vm.prank(GOVERNANCE);
        manager.setCapitalStreamDomains(streamId, duplicateStreamDomains);

        vm.expectRevert(abi.encodeWithSelector(Phase8UniversalValueManager.UnknownDomain.selector, unknownDomainId));
        bytes32[] memory missingStreamDomain = new bytes32[](1);
        missingStreamDomain[0] = unknownDomainId;
        vm.prank(GOVERNANCE);
        manager.setCapitalStreamDomains(streamId, missingStreamDomain);

        Phase8UniversalValueManager.CapitalStream memory streamUpdate = stream;
        streamUpdate.annualBudget = 750_000_000e6;
        streamUpdate.expansionBps = 1_500;
        streamUpdate.active = false;

        vm.prank(GOVERNANCE);
        manager.updateCapitalStream(streamId, streamUpdate);

        vm.prank(GOVERNANCE);
        manager.setCapitalStreamStatus(streamId, true);
        Phase8UniversalValueManager.CapitalStream memory streamState = manager.listCapitalStreams()[0].stream;
        assertTrue(streamState.active);

        vm.prank(GOVERNANCE);
        manager.removeDomain(domainId);

        assertEq(manager.listDomains().length, 0);
        assertEq(manager.getSentinelDomains(sentinelId).length, 0);
        assertEq(manager.getCapitalStreamDomains(streamId).length, 0);

        vm.prank(GOVERNANCE);
        manager.removeSentinel(sentinelId);
        assertEq(manager.listSentinels().length, 0);

        vm.prank(GOVERNANCE);
        manager.removeCapitalStream(streamId);
        assertEq(manager.listCapitalStreams().length, 0);

        bytes memory pauseData = abi.encodeWithSelector(Phase6MockSystemPause.pauseAll.selector);
        vm.prank(GOVERNANCE);
        manager.forwardPauseCall(pauseData);
        assertTrue(pauseHarness.paused());
        assertEq(pauseHarness.callCount(), 1);

        Phase8UniversalValueManager.SelfImprovementPlan memory plan = Phase8UniversalValueManager.SelfImprovementPlan({
            planURI: "ipfs://phase8/self-improvement/plan.json",
            planHash: keccak256("phase8-self-improvement"),
            cadenceSeconds: 7_200,
            lastExecutedAt: 0,
            lastReportURI: ""
        });

        vm.prank(GOVERNANCE);
        manager.setSelfImprovementPlan(plan);

        string memory storedPlanURI;
        bytes32 storedPlanHash;
        uint64 storedLastExecutedAt;
        string memory storedLastReportURI;

        (storedPlanURI, storedPlanHash, , storedLastExecutedAt, storedLastReportURI) = manager.selfImprovementPlan();
        assertEq(storedPlanURI, plan.planURI);
        assertEq(storedPlanHash, plan.planHash);

        uint64 executionTimestamp = 1_700_000_000;
        string memory reportURI = "ipfs://phase8/self-improvement/report-1.json";

        vm.prank(GOVERNANCE);
        manager.recordSelfImprovementExecution(executionTimestamp, reportURI);

        (storedPlanURI, storedPlanHash, , storedLastExecutedAt, storedLastReportURI) = manager.selfImprovementPlan();
        assertEq(storedLastExecutedAt, executionTimestamp);
        assertEq(storedLastReportURI, reportURI);

        vm.expectRevert(abi.encodeWithSelector(Phase8UniversalValueManager.InvalidExecutionTimestamp.selector, executionTimestamp - 1));
        vm.prank(GOVERNANCE);
        manager.recordSelfImprovementExecution(executionTimestamp - 1, reportURI);
    }
}

