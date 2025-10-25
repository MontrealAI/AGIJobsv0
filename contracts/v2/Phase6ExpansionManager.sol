// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {SystemPause} from "./SystemPause.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Phase6ExpansionManager
/// @notice Governance owned control surface coordinating cross-domain rollout for Phase 6.
/// @dev Stores domain specific wiring metadata so orchestrators and off-chain services can
///      deterministically route requests. The contract is intentionally simple and immutable
///      aside from governance controlled setters so that the owner retains complete authority
///      over the expansion plan.
contract Phase6ExpansionManager is Governable, ReentrancyGuard {
    using Address for address;

    /// @notice Tracks high level global configuration applied across all domains.
    struct GlobalConfig {
        address iotOracleRouter;
        address defaultL2Gateway;
        address didRegistry;
        address treasuryBridge;
        uint64 l2SyncCadence;
        string manifestURI;
    }

    /// @notice Domain description surfaced to indexers and orchestrators.
    struct Domain {
        string slug;
        string name;
        string metadataURI;
        address validationModule;
        address dataOracle;
        address l2Gateway;
        string subgraphEndpoint;
        address executionRouter;
        uint64 heartbeatSeconds;
        bool active;
    }

    /// @notice Minimal struct used when enumerating domains to callers.
    struct DomainView {
        bytes32 id;
        Domain config;
    }

    /// @notice Domain level operational constraints surfaced to orchestrators and subgraphs.
    struct DomainOperations {
        uint48 maxActiveJobs;
        uint48 maxQueueDepth;
        uint96 minStake;
        uint16 treasuryShareBps;
        uint16 circuitBreakerBps;
        bool requiresHumanValidation;
    }

    /// @notice Telemetry emitted by governance to describe live readiness metrics for a domain.
    struct DomainTelemetry {
        uint32 resilienceBps;
        uint32 automationBps;
        uint32 complianceBps;
        uint32 settlementLatencySeconds;
        bool usesL2Settlement;
        address sentinelOracle;
        address settlementAsset;
        bytes32 metricsDigest;
        bytes32 manifestHash;
    }

    struct DomainInfrastructure {
        address agentOps;
        address dataPipeline;
        address credentialVerifier;
        address fallbackOperator;
        string controlPlaneURI;
        uint64 autopilotCadence;
        bool autopilotEnabled;
    }

    /// @notice Global telemetry thresholds informing downstream governance automation.
    struct GlobalTelemetry {
        bytes32 manifestHash;
        bytes32 metricsDigest;
        uint32 resilienceFloorBps;
        uint32 automationFloorBps;
        uint32 oversightWeightBps;
    }

    struct GlobalInfrastructure {
        address meshCoordinator;
        address dataLake;
        address identityBridge;
        string topologyURI;
        uint64 autopilotCadence;
        bool enforceDecentralizedInfra;
    }

    /// @notice Global guard rails applied across all domains.
    struct GlobalGuards {
        uint16 treasuryBufferBps;
        uint16 circuitBreakerBps;
        uint32 anomalyGracePeriod;
        bool autoPauseEnabled;
        address oversightCouncil;
    }

    /// @notice Governance controlled anomaly escalation target.
    address public escalationBridge;

    /// @notice Registry describing which contract receives delegated pause calls.
    SystemPause public systemPause;

    /// @notice Captured immutable identifier for off-chain tooling versioning.
    string public constant SPEC_VERSION = "phase6.expansion.v2";

    /// @notice Current global configuration shared by all domains.
    GlobalConfig public globalConfig;

    /// @notice Global guard rails impacting all domains.
    GlobalGuards public globalGuards;

    mapping(bytes32 => Domain) private _domains;
    mapping(bytes32 => bool) private _known;
    mapping(bytes32 => DomainOperations) private _domainOperations;
    mapping(bytes32 => DomainTelemetry) private _domainTelemetry;
    mapping(bytes32 => DomainInfrastructure) private _domainInfrastructure;
    bytes32[] private _domainIndex;

    /// @notice Governance authored telemetry baseline shared across the network.
    GlobalTelemetry public globalTelemetry;

    /// @notice Global infrastructure wiring used by orchestrators and off-chain services.
    GlobalInfrastructure public globalInfrastructure;

    uint256 private constant _MAX_BPS = 10_000;

    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------

    error EmptySlug();
    error EmptyName();
    error UnknownDomain(bytes32 id);
    error DuplicateDomain(bytes32 id);
    error InvalidAddress(string field, address provided);
    error InvalidHeartbeat();
    error InvalidManifestURI();
    error InvalidMetadataURI();
    error InvalidPauseTarget(address target);
    error InvalidSubgraphEndpoint();
    error InvalidBps(string field, uint256 provided);
    error InvalidOperationsValue(string field);
    error InvalidAnomalyGracePeriod();
    error InvalidTelemetryValue(string field);
    error InvalidDigest(string field);
    error InvalidInfrastructureURI();
    error InvalidAutopilotCadence();
    error DomainIndexCorrupted(bytes32 id);

    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------

    event DomainRegistered(
        bytes32 indexed id,
        string slug,
        string name,
        string metadataURI,
        address validationModule,
        address dataOracle,
        address l2Gateway,
        string subgraphEndpoint,
        address executionRouter,
        uint64 heartbeatSeconds,
        bool active
    );
    event DomainUpdated(
        bytes32 indexed id,
        string slug,
        string name,
        string metadataURI,
        address validationModule,
        address dataOracle,
        address l2Gateway,
        string subgraphEndpoint,
        address executionRouter,
        uint64 heartbeatSeconds,
        bool active
    );
    event DomainStatusChanged(bytes32 indexed id, bool active);
    event DomainRemoved(bytes32 indexed id, string slug);
    event GlobalConfigUpdated(
        address indexed iotOracleRouter,
        address indexed defaultL2Gateway,
        address didRegistry,
        address treasuryBridge,
        uint64 l2SyncCadence,
        string manifestURI
    );
    event SystemPauseUpdated(address indexed newSystemPause);
    event EscalationBridgeUpdated(address indexed newEscalationBridge);
    event EscalationForwarded(address indexed target, bytes data, bytes response);
    event DomainOperationsUpdated(
        bytes32 indexed id,
        uint48 maxActiveJobs,
        uint48 maxQueueDepth,
        uint96 minStake,
        uint16 treasuryShareBps,
        uint16 circuitBreakerBps,
        bool requiresHumanValidation
    );
    event GlobalGuardsUpdated(
        uint16 treasuryBufferBps,
        uint16 circuitBreakerBps,
        uint32 anomalyGracePeriod,
        bool autoPauseEnabled,
        address oversightCouncil
    );
    event DomainTelemetryUpdated(
        bytes32 indexed id,
        uint32 resilienceBps,
        uint32 automationBps,
        uint32 complianceBps,
        uint32 settlementLatencySeconds,
        bool usesL2Settlement,
        address sentinelOracle,
        address settlementAsset,
        bytes32 metricsDigest,
        bytes32 manifestHash
    );
    event DomainInfrastructureUpdated(
        bytes32 indexed id,
        address agentOps,
        address dataPipeline,
        address credentialVerifier,
        address fallbackOperator,
        string controlPlaneURI,
        uint64 autopilotCadence,
        bool autopilotEnabled
    );
    event GlobalTelemetryUpdated(
        bytes32 manifestHash,
        bytes32 metricsDigest,
        uint32 resilienceFloorBps,
        uint32 automationFloorBps,
        uint32 oversightWeightBps
    );
    event GlobalInfrastructureUpdated(
        address indexed meshCoordinator,
        address indexed dataLake,
        address identityBridge,
        string topologyURI,
        uint64 autopilotCadence,
        bool enforceDecentralizedInfra
    );

    constructor(address initialGovernance) Governable(initialGovernance) {}

    /// -----------------------------------------------------------------------
    /// Domain management
    /// -----------------------------------------------------------------------

    /// @notice Registers a brand new domain with the supplied configuration.
    function registerDomain(Domain calldata config) external onlyGovernance returns (bytes32 id) {
        _validateConfig(config);
        id = _idFor(config.slug);
        if (_known[id]) revert DuplicateDomain(id);
        _domains[id] = config;
        _known[id] = true;
        _domainIndex.push(id);
        emit DomainRegistered(
            id,
            config.slug,
            config.name,
            config.metadataURI,
            config.validationModule,
            config.dataOracle,
            config.l2Gateway,
            config.subgraphEndpoint,
            config.executionRouter,
            config.heartbeatSeconds,
            config.active
        );
    }

    /// @notice Updates the configuration for an existing domain.
    function updateDomain(bytes32 id, Domain calldata config) external onlyGovernance {
        if (!_known[id]) revert UnknownDomain(id);
        _validateConfig(config);
        if (id != _idFor(config.slug)) {
            revert DuplicateDomain(_idFor(config.slug));
        }
        _domains[id] = config;
        emit DomainUpdated(
            id,
            config.slug,
            config.name,
            config.metadataURI,
            config.validationModule,
            config.dataOracle,
            config.l2Gateway,
            config.subgraphEndpoint,
            config.executionRouter,
            config.heartbeatSeconds,
            config.active
        );
    }

    /// @notice Toggles an existing domain.
    function setDomainStatus(bytes32 id, bool active) external onlyGovernance {
        if (!_known[id]) revert UnknownDomain(id);
        Domain storage domain = _domains[id];
        if (domain.active == active) {
            return;
        }
        domain.active = active;
        emit DomainStatusChanged(id, active);
    }

    /// @notice Permanently removes a domain and all associated metadata.
    function removeDomain(bytes32 id) external onlyGovernance {
        if (!_known[id]) revert UnknownDomain(id);
        Domain memory removed = _domains[id];
        delete _domains[id];
        delete _domainOperations[id];
        delete _domainTelemetry[id];
        delete _domainInfrastructure[id];
        _known[id] = false;
        _removeDomainFromIndex(id);
        emit DomainRemoved(id, removed.slug);
    }

    /// @notice Batch updates subset of domain pointers while preserving immutable metadata.
    function configureDomainConnectors(
        bytes32 id,
        address validationModule,
        address dataOracle,
        address l2Gateway,
        string calldata subgraphEndpoint,
        address executionRouter,
        uint64 heartbeatSeconds
    ) external onlyGovernance {
        if (!_known[id]) revert UnknownDomain(id);
        Domain storage domain = _domains[id];
        if (validationModule != address(0)) {
            _requireContract(validationModule, "validationModule");
            domain.validationModule = validationModule;
        }
        if (dataOracle != address(0)) {
            _requireContract(dataOracle, "dataOracle");
            domain.dataOracle = dataOracle;
        }
        if (l2Gateway != address(0)) {
            _requireContract(l2Gateway, "l2Gateway");
            domain.l2Gateway = l2Gateway;
        }
        if (bytes(subgraphEndpoint).length != 0) {
            domain.subgraphEndpoint = subgraphEndpoint;
        }
        if (executionRouter != address(0)) {
            _requireContract(executionRouter, "executionRouter");
            domain.executionRouter = executionRouter;
        }
        if (heartbeatSeconds != 0) {
            if (heartbeatSeconds < 30) revert InvalidHeartbeat();
            domain.heartbeatSeconds = heartbeatSeconds;
        }
        emit DomainUpdated(
            id,
            domain.slug,
            domain.name,
            domain.metadataURI,
            domain.validationModule,
            domain.dataOracle,
            domain.l2Gateway,
            domain.subgraphEndpoint,
            domain.executionRouter,
            domain.heartbeatSeconds,
            domain.active
        );
    }

    /// @notice Configures operational guard rails for a domain.
    function setDomainOperations(bytes32 id, DomainOperations calldata config) external onlyGovernance {
        if (!_known[id]) revert UnknownDomain(id);
        _validateDomainOperations(config);
        _domainOperations[id] = config;
        emit DomainOperationsUpdated(
            id,
            config.maxActiveJobs,
            config.maxQueueDepth,
            config.minStake,
            config.treasuryShareBps,
            config.circuitBreakerBps,
            config.requiresHumanValidation
        );
    }

    /// @notice Updates governance-authored telemetry for a specific domain.
    function setDomainTelemetry(bytes32 id, DomainTelemetry calldata telemetry) external onlyGovernance {
        if (!_known[id]) revert UnknownDomain(id);
        _validateDomainTelemetry(telemetry);
        _domainTelemetry[id] = telemetry;
        emit DomainTelemetryUpdated(
            id,
            telemetry.resilienceBps,
            telemetry.automationBps,
            telemetry.complianceBps,
            telemetry.settlementLatencySeconds,
            telemetry.usesL2Settlement,
            telemetry.sentinelOracle,
            telemetry.settlementAsset,
            telemetry.metricsDigest,
            telemetry.manifestHash
        );
    }

    /// @notice Publishes infrastructure wiring metadata for a domain.
    function setDomainInfrastructure(bytes32 id, DomainInfrastructure calldata infrastructure)
        external
        onlyGovernance
    {
        if (!_known[id]) revert UnknownDomain(id);
        _validateDomainInfrastructure(infrastructure);
        _domainInfrastructure[id] = infrastructure;
        emit DomainInfrastructureUpdated(
            id,
            infrastructure.agentOps,
            infrastructure.dataPipeline,
            infrastructure.credentialVerifier,
            infrastructure.fallbackOperator,
            infrastructure.controlPlaneURI,
            infrastructure.autopilotCadence,
            infrastructure.autopilotEnabled
        );
    }

    /// -----------------------------------------------------------------------
    /// Global configuration
    /// -----------------------------------------------------------------------

    function setGlobalConfig(GlobalConfig calldata config) external onlyGovernance {
        if (bytes(config.manifestURI).length == 0) revert InvalidManifestURI();
        if (config.l2SyncCadence != 0 && config.l2SyncCadence < 30) revert InvalidHeartbeat();
        if (config.iotOracleRouter != address(0)) {
            _requireContract(config.iotOracleRouter, "iotOracleRouter");
        }
        if (config.defaultL2Gateway != address(0)) {
            _requireContract(config.defaultL2Gateway, "defaultL2Gateway");
        }
        if (config.didRegistry != address(0)) {
            _requireContract(config.didRegistry, "didRegistry");
        }
        if (config.treasuryBridge != address(0)) {
            _requireContract(config.treasuryBridge, "treasuryBridge");
        }
        globalConfig = config;
        emit GlobalConfigUpdated(
            config.iotOracleRouter,
            config.defaultL2Gateway,
            config.didRegistry,
            config.treasuryBridge,
            config.l2SyncCadence,
            config.manifestURI
        );
    }

    function setSystemPause(SystemPause newPause) external onlyGovernance {
        if (address(newPause) == address(0)) revert InvalidPauseTarget(address(0));
        _requireContract(address(newPause), "systemPause");
        systemPause = newPause;
        emit SystemPauseUpdated(address(newPause));
    }

    function setEscalationBridge(address newBridge) external onlyGovernance {
        if (newBridge == address(0)) revert InvalidPauseTarget(address(0));
        _requireContract(newBridge, "escalationBridge");
        escalationBridge = newBridge;
        emit EscalationBridgeUpdated(newBridge);
    }

    function forwardPauseCall(bytes calldata data)
        external
        onlyGovernance
        nonReentrant
        returns (bytes memory)
    {
        address target = address(systemPause);
        if (target == address(0)) revert InvalidPauseTarget(target);
        bytes memory response = Address.functionCall(target, data);
        emit EscalationForwarded(target, data, response);
        return response;
    }

    function forwardEscalation(bytes calldata data)
        external
        onlyGovernance
        nonReentrant
        returns (bytes memory)
    {
        address target = escalationBridge;
        if (target == address(0)) revert InvalidPauseTarget(target);
        bytes memory response = Address.functionCall(target, data);
        emit EscalationForwarded(target, data, response);
        return response;
    }

    function setGlobalGuards(GlobalGuards calldata config) external onlyGovernance {
        _validateGlobalGuards(config);
        globalGuards = config;
        emit GlobalGuardsUpdated(
            config.treasuryBufferBps,
            config.circuitBreakerBps,
            config.anomalyGracePeriod,
            config.autoPauseEnabled,
            config.oversightCouncil
        );
    }

    /// @notice Updates the network-wide telemetry thresholds.
    function setGlobalTelemetry(GlobalTelemetry calldata telemetry) external onlyGovernance {
        _validateGlobalTelemetry(telemetry);
        globalTelemetry = telemetry;
        emit GlobalTelemetryUpdated(
            telemetry.manifestHash,
            telemetry.metricsDigest,
            telemetry.resilienceFloorBps,
            telemetry.automationFloorBps,
            telemetry.oversightWeightBps
        );
    }

    /// @notice Updates the shared infrastructure mesh description.
    function setGlobalInfrastructure(GlobalInfrastructure calldata infrastructure) external onlyGovernance {
        _validateGlobalInfrastructure(infrastructure);
        globalInfrastructure = infrastructure;
        emit GlobalInfrastructureUpdated(
            infrastructure.meshCoordinator,
            infrastructure.dataLake,
            infrastructure.identityBridge,
            infrastructure.topologyURI,
            infrastructure.autopilotCadence,
            infrastructure.enforceDecentralizedInfra
        );
    }

    /// -----------------------------------------------------------------------
    /// View helpers
    /// -----------------------------------------------------------------------

    function domainId(string calldata slug) external pure returns (bytes32) {
        return _idFor(slug);
    }

    function domainExists(bytes32 id) external view returns (bool) {
        return _known[id];
    }

    function getDomain(bytes32 id) external view returns (Domain memory) {
        if (!_known[id]) revert UnknownDomain(id);
        return _domains[id];
    }

    function getDomainOperations(bytes32 id) external view returns (DomainOperations memory) {
        if (!_known[id]) revert UnknownDomain(id);
        return _domainOperations[id];
    }

    function getDomainTelemetry(bytes32 id) external view returns (DomainTelemetry memory) {
        if (!_known[id]) revert UnknownDomain(id);
        return _domainTelemetry[id];
    }

    function getDomainInfrastructure(bytes32 id) external view returns (DomainInfrastructure memory) {
        if (!_known[id]) revert UnknownDomain(id);
        return _domainInfrastructure[id];
    }

    function listDomains() external view returns (DomainView[] memory results) {
        uint256 length = _domainIndex.length;
        results = new DomainView[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes32 id = _domainIndex[i];
            results[i] = DomainView({id: id, config: _domains[id]});
        }
    }

    function domainCount() external view returns (uint256) {
        return _domainIndex.length;
    }

    /// -----------------------------------------------------------------------
    /// Internal helpers
    /// -----------------------------------------------------------------------

    function _validateConfig(Domain calldata config) private view {
        if (bytes(config.slug).length == 0) revert EmptySlug();
        if (bytes(config.name).length == 0) revert EmptyName();
        if (bytes(config.metadataURI).length == 0) revert InvalidMetadataURI();
        if (bytes(config.subgraphEndpoint).length == 0) revert InvalidSubgraphEndpoint();
        if (config.heartbeatSeconds < 30) revert InvalidHeartbeat();
        _requireContract(config.validationModule, "validationModule");
        if (config.dataOracle != address(0)) {
            _requireContract(config.dataOracle, "dataOracle");
        }
        if (config.l2Gateway != address(0)) {
            _requireContract(config.l2Gateway, "l2Gateway");
        }
        if (config.executionRouter != address(0)) {
            _requireContract(config.executionRouter, "executionRouter");
        }
    }

    function _requireContract(address candidate, string memory field) private view {
        if (candidate == address(0) || candidate.code.length == 0) {
            revert InvalidAddress(field, candidate);
        }
    }

    function _validateDomainOperations(DomainOperations calldata config) private pure {
        if (config.maxActiveJobs == 0) revert InvalidOperationsValue("maxActiveJobs");
        if (config.maxQueueDepth < config.maxActiveJobs) revert InvalidOperationsValue("maxQueueDepth");
        if (config.minStake == 0) revert InvalidOperationsValue("minStake");
        if (config.treasuryShareBps > _MAX_BPS) revert InvalidBps("treasuryShareBps", config.treasuryShareBps);
        if (config.circuitBreakerBps > _MAX_BPS) revert InvalidBps("circuitBreakerBps", config.circuitBreakerBps);
    }

    function _validateGlobalGuards(GlobalGuards calldata config) private view {
        if (config.treasuryBufferBps > _MAX_BPS) revert InvalidBps("treasuryBufferBps", config.treasuryBufferBps);
        if (config.circuitBreakerBps > _MAX_BPS) revert InvalidBps("circuitBreakerBps", config.circuitBreakerBps);
        if (config.anomalyGracePeriod != 0 && config.anomalyGracePeriod < 30) revert InvalidAnomalyGracePeriod();
        if (config.oversightCouncil != address(0)) {
            _requireContract(config.oversightCouncil, "oversightCouncil");
        }
    }

    function _validateDomainTelemetry(DomainTelemetry calldata telemetry) private view {
        if (telemetry.resilienceBps > _MAX_BPS) revert InvalidBps("resilienceBps", telemetry.resilienceBps);
        if (telemetry.automationBps > _MAX_BPS) revert InvalidBps("automationBps", telemetry.automationBps);
        if (telemetry.complianceBps > _MAX_BPS) revert InvalidBps("complianceBps", telemetry.complianceBps);
        if (telemetry.metricsDigest == bytes32(0)) revert InvalidDigest("metricsDigest");
        if (telemetry.manifestHash == bytes32(0)) revert InvalidDigest("manifestHash");
        if (telemetry.settlementLatencySeconds != 0 && telemetry.settlementLatencySeconds < 5) {
            revert InvalidTelemetryValue("settlementLatencySeconds");
        }
        if (telemetry.sentinelOracle != address(0)) {
            _requireContract(telemetry.sentinelOracle, "sentinelOracle");
        }
        if (telemetry.settlementAsset != address(0)) {
            _requireContract(telemetry.settlementAsset, "settlementAsset");
        }
    }

    function _validateGlobalTelemetry(GlobalTelemetry calldata telemetry) private pure {
        if (telemetry.metricsDigest == bytes32(0)) revert InvalidDigest("metricsDigest");
        if (telemetry.manifestHash == bytes32(0)) revert InvalidDigest("manifestHash");
        if (telemetry.resilienceFloorBps > _MAX_BPS) revert InvalidBps("resilienceFloorBps", telemetry.resilienceFloorBps);
        if (telemetry.automationFloorBps > _MAX_BPS) revert InvalidBps("automationFloorBps", telemetry.automationFloorBps);
        if (telemetry.oversightWeightBps > _MAX_BPS) revert InvalidBps("oversightWeightBps", telemetry.oversightWeightBps);
    }

    function _validateDomainInfrastructure(DomainInfrastructure calldata infrastructure) private view {
        if (bytes(infrastructure.controlPlaneURI).length == 0) {
            revert InvalidInfrastructureURI();
        }
        if (infrastructure.agentOps != address(0)) {
            _requireContract(infrastructure.agentOps, "agentOps");
        }
        if (infrastructure.dataPipeline != address(0)) {
            _requireContract(infrastructure.dataPipeline, "dataPipeline");
        }
        if (infrastructure.credentialVerifier != address(0)) {
            _requireContract(infrastructure.credentialVerifier, "credentialVerifier");
        }
        if (infrastructure.autopilotCadence != 0 && infrastructure.autopilotCadence < 30) {
            revert InvalidAutopilotCadence();
        }
        if (infrastructure.autopilotEnabled && infrastructure.autopilotCadence < 30) {
            revert InvalidAutopilotCadence();
        }
    }

    function _validateGlobalInfrastructure(GlobalInfrastructure calldata infrastructure) private view {
        if (bytes(infrastructure.topologyURI).length == 0) {
            revert InvalidInfrastructureURI();
        }
        if (infrastructure.meshCoordinator != address(0)) {
            _requireContract(infrastructure.meshCoordinator, "meshCoordinator");
        }
        if (infrastructure.dataLake != address(0)) {
            _requireContract(infrastructure.dataLake, "dataLake");
        }
        if (infrastructure.identityBridge != address(0)) {
            _requireContract(infrastructure.identityBridge, "identityBridge");
        }
        if (infrastructure.autopilotCadence != 0 && infrastructure.autopilotCadence < 30) {
            revert InvalidAutopilotCadence();
        }
    }

    function _removeDomainFromIndex(bytes32 id) private {
        uint256 length = _domainIndex.length;
        for (uint256 i = 0; i < length; i++) {
            if (_domainIndex[i] == id) {
                if (i != length - 1) {
                    _domainIndex[i] = _domainIndex[length - 1];
                }
                _domainIndex.pop();
                return;
            }
        }
        revert DomainIndexCorrupted(id);
    }

    function _idFor(string memory slug) private pure returns (bytes32) {
        if (bytes(slug).length == 0) revert EmptySlug();
        return keccak256(bytes(_normalize(slug)));
    }

    function _normalize(string memory input) private pure returns (string memory) {
        bytes memory raw = bytes(input);
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 char = raw[i];
            if (char >= 0x41 && char <= 0x5A) {
                raw[i] = bytes1(uint8(char) + 32);
            }
        }
        return string(raw);
    }
}
