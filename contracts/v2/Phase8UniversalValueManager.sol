// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {SystemPause} from "./SystemPause.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Phase8UniversalValueManager
/// @notice Governance control surface for Phase 8 universal value dominance deployments.
/// @dev The contract keeps the owner in full command of the Phase 8 rollout plan. All
///      registries (domains, sentinels, capital streams) are mutable exclusively through
///      governance calls and emit deterministic events for off-chain tooling.
contract Phase8UniversalValueManager is Governable, ReentrancyGuard {
    using Address for address;

    struct GlobalParameters {
        address treasury;
        address universalVault;
        address upgradeCoordinator;
        address validatorRegistry;
        address missionControl;
        address knowledgeGraph;
        uint64 heartbeatSeconds;
        uint64 guardianReviewWindow;
        uint256 maxDrawdownBps;
        string manifestoURI;
    }

    struct ValueDomain {
        string slug;
        string name;
        string metadataURI;
        address orchestrator;
        address capitalVault;
        address validatorModule;
        address policyKernel;
        uint64 heartbeatSeconds;
        uint256 tvlLimit;
        uint256 autonomyLevelBps;
        bool active;
    }

    struct DomainView {
        bytes32 id;
        ValueDomain config;
    }

    struct SentinelProfile {
        string slug;
        string name;
        string uri;
        address agent;
        uint64 coverageSeconds;
        uint256 sensitivityBps;
        bool active;
    }

    struct SentinelView {
        bytes32 id;
        SentinelProfile profile;
    }

    struct CapitalStream {
        string slug;
        string name;
        string uri;
        address vault;
        uint256 annualBudget;
        uint256 expansionBps;
        bool active;
    }

    struct CapitalStreamView {
        bytes32 id;
        CapitalStream stream;
    }

    struct SelfImprovementPlan {
        string planURI;
        bytes32 planHash;
        uint64 cadenceSeconds;
        uint64 lastExecutedAt;
        string lastReportURI;
    }

    string public constant SPEC_VERSION = "phase8.universal-value.v1";

    GlobalParameters public globalParameters;
    address public guardianCouncil;
    SystemPause public systemPause;
    SelfImprovementPlan public selfImprovementPlan;

    mapping(bytes32 => ValueDomain) private _domains;
    mapping(bytes32 => bool) private _knownDomain;
    bytes32[] private _domainIndex;

    mapping(bytes32 => SentinelProfile) private _sentinels;
    mapping(bytes32 => bool) private _knownSentinel;
    bytes32[] private _sentinelIndex;
    mapping(bytes32 => bytes32[]) private _sentinelDomainBindings;

    mapping(bytes32 => CapitalStream) private _capitalStreams;
    mapping(bytes32 => bool) private _knownStream;
    bytes32[] private _streamIndex;
    mapping(bytes32 => bytes32[]) private _streamDomainBindings;

    /// ---------------------------------------------------------------------
    /// Errors
    /// ---------------------------------------------------------------------

    error EmptySlug();
    error EmptyName();
    error DuplicateDomain(bytes32 id);
    error UnknownDomain(bytes32 id);
    error DuplicateSentinel(bytes32 id);
    error UnknownSentinel(bytes32 id);
    error DuplicateStream(bytes32 id);
    error UnknownStream(bytes32 id);
    error DuplicateBinding(bytes32 id);
    error InvalidAddress(string field, address provided);
    error InvalidHeartbeat();
    error InvalidBps(uint256 provided);
    error InvalidURI(string field);
    error ManifestRequired();
    error InvalidCadence(uint64 provided);
    error InvalidPlanHash();
    error InvalidExecutionTimestamp(uint64 provided);
    error SelfImprovementPlanUnset();

    /// ---------------------------------------------------------------------
    /// Events
    /// ---------------------------------------------------------------------

    /// @notice Emitted when the global parameter struct is replaced.
    /// @dev Dashboards should treat the entire struct as authoritative and refresh cached copies.
    event GlobalParametersUpdated(GlobalParameters params);

    /// @notice Emitted when the guardian council controlling emergency actions changes.
    /// @dev Allows subgraphs to maintain the currently empowered guardian address.
    event GuardianCouncilUpdated(address indexed council);

    /// @notice Emitted when the pause contract receiving forwarded calls is updated.
    /// @dev Off-chain systems should refresh pause-call routing using this address.
    event SystemPauseUpdated(address indexed systemPause);

    /// @notice Emitted after governance forwards calldata to the configured pause contract.
    /// @dev `response` captures the return data allowing dashboards to surface execution results.
    event PauseCallForwarded(address indexed target, bytes data, bytes response);

    /// @notice Emitted when a new value domain configuration is created.
    /// @dev Signals dashboards to index the freshly registered domain struct.
    event DomainRegistered(bytes32 indexed id, ValueDomain domain);

    /// @notice Emitted after an existing value domain configuration is mutated.
    /// @dev Observers should re-ingest the full struct as all fields are rewriteable.
    event DomainUpdated(bytes32 indexed id, ValueDomain domain);

    /// @notice Emitted when the active flag for a domain toggles.
    /// @dev Downstream automation may pause integrations when `active` becomes false.
    event DomainStatusChanged(bytes32 indexed id, bool active);

    /// @notice Emitted when governance adjusts domain capacity or heartbeat tolerances.
    /// @dev The event captures the normalized values so indexers need not fetch storage.
    event DomainLimitsUpdated(bytes32 indexed id, uint256 tvlLimit, uint256 autonomyLevelBps, uint64 heartbeatSeconds);

    /// @notice Emitted when a new sentinel profile joins the registry.
    /// @dev Use to map slugs to guardian monitoring metadata.
    event SentinelRegistered(bytes32 indexed id, SentinelProfile profile);

    /// @notice Emitted when an existing sentinel profile is rewritten.
    /// @dev Indicates that capabilities or links changed and cached views should refresh.
    event SentinelUpdated(bytes32 indexed id, SentinelProfile profile);

    /// @notice Emitted when a sentinel's active status flips.
    /// @dev Downstream automation should halt delegated duties when inactive.
    event SentinelStatusChanged(bytes32 indexed id, bool active);

    /// @notice Emitted after governance replaces the set of domains a sentinel oversees.
    /// @dev Bindings are rewritten wholesale so indexers should replace previous associations.
    event SentinelDomainsUpdated(bytes32 indexed id, bytes32[] domainIds);

    /// @notice Emitted when a sentinel is permanently removed.
    /// @dev Indicates that associated bindings should be purged from caches.
    event SentinelRemoved(bytes32 indexed id);

    /// @notice Emitted when a capital stream is registered.
    /// @dev Downstream systems should treat the payload as authoritative capital allocation metadata.
    event CapitalStreamRegistered(bytes32 indexed id, CapitalStream stream);

    /// @notice Emitted when an existing capital stream configuration is updated.
    /// @dev All fields can change, so indexers should overwrite cached copies.
    event CapitalStreamUpdated(bytes32 indexed id, CapitalStream stream);

    /// @notice Emitted when a capital stream's active flag toggles.
    /// @dev Off-chain accounting may pause disbursements when the stream is inactive.
    event CapitalStreamStatusChanged(bytes32 indexed id, bool active);

    /// @notice Emitted when governance rewrites the domain bindings for a capital stream.
    /// @dev Bindings are a full replacement and downstream consumers should rebuild associations.
    event CapitalStreamDomainsUpdated(bytes32 indexed id, bytes32[] domainIds);

    /// @notice Emitted when a capital stream is removed from the registry.
    /// @dev Notifies indexers to purge associated metadata and bindings.
    event CapitalStreamRemoved(bytes32 indexed id);

    /// @notice Emitted when a value domain is removed and all bindings are pruned.
    /// @dev Off-chain caches should delete the domain and recompute sentinel/stream relationships.
    event DomainRemoved(bytes32 indexed id);

    /// @notice Emitted when the self-improvement plan configuration is updated.
    /// @dev Captures the entire struct so observers can mirror cadence, plan hash and context.
    event SelfImprovementPlanUpdated(
        string planURI,
        bytes32 indexed planHash,
        uint64 cadenceSeconds,
        uint64 lastExecutedAt,
        string lastReportURI
    );

    /// @notice Emitted when a self-improvement execution is logged.
    /// @dev Dashboards can thread execution reports per `planHash` via this event.
    event SelfImprovementExecutionRecorded(uint64 executedAt, string reportURI, bytes32 indexed planHash);

    constructor(address initialGovernance) Governable(initialGovernance) {}

    /// ---------------------------------------------------------------------
    /// Global configuration management
    /// ---------------------------------------------------------------------

    /// @notice Replaces the global parameter envelope governing Phase 8 operations.
    /// @dev Emits {GlobalParametersUpdated} with the sanitized `params` struct.
    function setGlobalParameters(GlobalParameters calldata params) external onlyGovernance {
        _validateGlobalParameters(params);
        globalParameters = params;
        emit GlobalParametersUpdated(params);
    }

    /// @notice Updates the guardian council responsible for accelerated emergency actions.
    /// @dev Emits {GuardianCouncilUpdated} whenever the council changes.
    function setGuardianCouncil(address council) external onlyGovernance {
        if (council == address(0)) revert InvalidAddress("guardianCouncil", council);
        guardianCouncil = council;
        emit GuardianCouncilUpdated(council);
    }

    /// @notice Points the manager at a new {SystemPause} contract for forwarding emergency calls.
    /// @dev Emits {SystemPauseUpdated} and rejects EOAs or contracts without code deployed.
    function setSystemPause(address newPause) external onlyGovernance {
        if (newPause == address(0) || newPause.code.length == 0) {
            revert InvalidAddress("systemPause", newPause);
        }
        systemPause = SystemPause(payable(newPause));
        emit SystemPauseUpdated(newPause);
    }

    /// @notice Refreshes the manifesto URI without touching the rest of the global parameters.
    /// @dev Emits {GlobalParametersUpdated} so indexers can capture the new manifesto hash.
    function updateManifesto(string calldata newManifestoURI) external onlyGovernance {
        if (bytes(newManifestoURI).length == 0) revert ManifestRequired();
        GlobalParameters memory params = globalParameters;
        params.manifestoURI = newManifestoURI;
        globalParameters = params;
        emit GlobalParametersUpdated(params);
    }

    /// @notice Tunes the heartbeat, guardian review window and max drawdown safeguards.
    /// @dev Emits {GlobalParametersUpdated} once the sanitized parameters are stored.
    function updateRiskParameters(uint64 heartbeatSeconds, uint64 guardianReviewWindow, uint256 maxDrawdownBps)
        external
        onlyGovernance
    {
        if (heartbeatSeconds == 0 || guardianReviewWindow == 0) revert InvalidHeartbeat();
        if (maxDrawdownBps > 10_000) revert InvalidBps(maxDrawdownBps);
        GlobalParameters memory params = globalParameters;
        params.heartbeatSeconds = heartbeatSeconds;
        params.guardianReviewWindow = guardianReviewWindow;
        params.maxDrawdownBps = maxDrawdownBps;
        globalParameters = params;
        emit GlobalParametersUpdated(params);
    }

    /// @notice Forwards a governance-authorised call to the configured {SystemPause} contract.
    /// @dev Emits {PauseCallForwarded} echoing the calldata and return data for observability.
    function forwardPauseCall(bytes calldata data) external onlyGovernance nonReentrant returns (bytes memory) {
        address pauseTarget = address(systemPause);
        if (pauseTarget == address(0)) revert InvalidAddress("systemPause", pauseTarget);
        bytes memory response = pauseTarget.functionCall(data);
        emit PauseCallForwarded(pauseTarget, data, response);
        return response;
    }

    /// @notice Installs or replaces the self-improvement plan tracked on-chain.
    /// @dev Emits {SelfImprovementPlanUpdated} with the canonical cadence and plan hash.
    function setSelfImprovementPlan(SelfImprovementPlan calldata plan) external onlyGovernance {
        _validateSelfImprovementPlan(plan);
        selfImprovementPlan = plan;
        emit SelfImprovementPlanUpdated(
            plan.planURI,
            plan.planHash,
            plan.cadenceSeconds,
            plan.lastExecutedAt,
            plan.lastReportURI
        );
    }

    /// @notice Records a successful execution aligned with the configured self-improvement plan.
    /// @dev Emits {SelfImprovementExecutionRecorded} including the execution timestamp and report URI.
    function recordSelfImprovementExecution(uint64 executedAt, string calldata reportURI) external onlyGovernance {
        if (bytes(reportURI).length == 0) revert InvalidURI("reportURI");
        if (executedAt == 0) revert InvalidExecutionTimestamp(executedAt);

        SelfImprovementPlan memory plan = selfImprovementPlan;
        if (plan.planHash == bytes32(0)) revert SelfImprovementPlanUnset();
        if (executedAt < plan.lastExecutedAt) revert InvalidExecutionTimestamp(executedAt);

        plan.lastExecutedAt = executedAt;
        plan.lastReportURI = reportURI;
        selfImprovementPlan = plan;
        emit SelfImprovementExecutionRecorded(executedAt, reportURI, plan.planHash);
    }

    /// ---------------------------------------------------------------------
    /// Domain registry management
    /// ---------------------------------------------------------------------

    /// @notice Registers a new value domain and emits the canonical configuration payload.
    /// @dev Returns the keccak256 hash of the normalized slug and emits {DomainRegistered}.
    function registerDomain(ValueDomain calldata config) external onlyGovernance returns (bytes32 id) {
        _validateDomain(config);
        id = _idFor(config.slug);
        if (_knownDomain[id]) revert DuplicateDomain(id);
        _domains[id] = config;
        _knownDomain[id] = true;
        _domainIndex.push(id);
        emit DomainRegistered(id, config);
    }

    /// @notice Updates an existing domain configuration in-place.
    /// @dev Reverts if the slug maps to a different identifier to prevent accidental re-keys.
    function updateDomain(bytes32 id, ValueDomain calldata config) external onlyGovernance {
        if (!_knownDomain[id]) revert UnknownDomain(id);
        _validateDomain(config);
        if (id != _idFor(config.slug)) {
            revert DuplicateDomain(_idFor(config.slug));
        }
        _domains[id] = config;
        emit DomainUpdated(id, config);
    }

    /// @notice Deletes a domain and prunes all sentinel/stream bindings pointing at it.
    /// @dev Emits {DomainRemoved} and cleans up auxiliary indexes to avoid dangling references.
    function removeDomain(bytes32 id) external onlyGovernance {
        if (!_knownDomain[id]) revert UnknownDomain(id);
        delete _domains[id];
        _knownDomain[id] = false;
        _removeIndexEntry(_domainIndex, id);
        _pruneBindings(_sentinelDomainBindings, _sentinelIndex, id);
        _pruneBindings(_streamDomainBindings, _streamIndex, id);
        emit DomainRemoved(id);
    }

    /// @notice Flips the active flag for a registered domain.
    /// @dev Emits {DomainStatusChanged} only when the flag actually transitions.
    function setDomainStatus(bytes32 id, bool active) external onlyGovernance {
        if (!_knownDomain[id]) revert UnknownDomain(id);
        ValueDomain storage domain = _domains[id];
        if (domain.active == active) {
            return;
        }
        domain.active = active;
        emit DomainStatusChanged(id, active);
    }

    /// @notice Updates capacity, autonomy and heartbeat settings for a domain.
    /// @dev Emits {DomainLimitsUpdated} so indexers can capture fresh risk thresholds.
    function configureDomainLimits(bytes32 id, uint256 tvlLimit, uint256 autonomyLevelBps, uint64 heartbeatSeconds)
        external
        onlyGovernance
    {
        if (!_knownDomain[id]) revert UnknownDomain(id);
        if (autonomyLevelBps > 10_000) revert InvalidBps(autonomyLevelBps);
        if (heartbeatSeconds == 0) revert InvalidHeartbeat();
        ValueDomain storage domain = _domains[id];
        domain.tvlLimit = tvlLimit;
        domain.autonomyLevelBps = autonomyLevelBps;
        domain.heartbeatSeconds = heartbeatSeconds;
        emit DomainLimitsUpdated(id, tvlLimit, autonomyLevelBps, heartbeatSeconds);
    }

    /// @notice Lists all registered domains with their storage identifiers.
    /// @dev Order matches insertion order and is suitable for read-only pagination in off-chain clients.
    function listDomains() external view returns (DomainView[] memory) {
        uint256 length = _domainIndex.length;
        DomainView[] memory result = new DomainView[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes32 id = _domainIndex[i];
            result[i] = DomainView({id: id, config: _domains[id]});
        }
        return result;
    }

    /// @notice Fetches a domain configuration by its deterministic identifier.
    /// @dev Reverts with {UnknownDomain} when the domain has never been registered or was removed.
    function getDomain(bytes32 id) external view returns (ValueDomain memory) {
        if (!_knownDomain[id]) revert UnknownDomain(id);
        return _domains[id];
    }

    /// ---------------------------------------------------------------------
    /// Sentinel registry management
    /// ---------------------------------------------------------------------

    /// @notice Adds a sentinel profile responsible for monitoring specific domains.
    /// @dev Emits {SentinelRegistered} and returns the deterministic identifier derived from the slug.
    function registerSentinel(SentinelProfile calldata profile) external onlyGovernance returns (bytes32 id) {
        _validateSentinel(profile);
        id = _idFor(profile.slug);
        if (_knownSentinel[id]) revert DuplicateSentinel(id);
        _sentinels[id] = profile;
        _knownSentinel[id] = true;
        _sentinelIndex.push(id);
        emit SentinelRegistered(id, profile);
    }

    /// @notice Replaces the stored metadata for an existing sentinel.
    /// @dev Prevents accidental re-keying by requiring the slug to hash to `id`.
    function updateSentinel(bytes32 id, SentinelProfile calldata profile) external onlyGovernance {
        if (!_knownSentinel[id]) revert UnknownSentinel(id);
        _validateSentinel(profile);
        if (id != _idFor(profile.slug)) {
            revert DuplicateSentinel(_idFor(profile.slug));
        }
        _sentinels[id] = profile;
        emit SentinelUpdated(id, profile);
    }

    /// @notice Toggles the active flag for a sentinel.
    /// @dev Emits {SentinelStatusChanged} only when the value changes to avoid noisy events.
    function setSentinelStatus(bytes32 id, bool active) external onlyGovernance {
        if (!_knownSentinel[id]) revert UnknownSentinel(id);
        SentinelProfile storage sentinel = _sentinels[id];
        if (sentinel.active == active) {
            return;
        }
        sentinel.active = active;
        emit SentinelStatusChanged(id, active);
    }

    /// @notice Replaces the domains a sentinel monitors.
    /// @dev Emits {SentinelDomainsUpdated} with the full set of bindings to simplify indexing.
    function setSentinelDomains(bytes32 id, bytes32[] calldata domainIds) external onlyGovernance {
        if (!_knownSentinel[id]) revert UnknownSentinel(id);
        _validateBindingSet(domainIds);
        delete _sentinelDomainBindings[id];
        bytes32[] storage bindings = _sentinelDomainBindings[id];
        for (uint256 i = 0; i < domainIds.length; i++) {
            bindings.push(domainIds[i]);
        }
        emit SentinelDomainsUpdated(id, domainIds);
    }

    /// @notice Removes a sentinel from the registry and clears domain bindings.
    /// @dev Emits {SentinelRemoved} and prunes indexes to keep iteration efficient.
    function removeSentinel(bytes32 id) external onlyGovernance {
        if (!_knownSentinel[id]) revert UnknownSentinel(id);
        delete _sentinels[id];
        delete _sentinelDomainBindings[id];
        _knownSentinel[id] = false;
        _removeIndexEntry(_sentinelIndex, id);
        emit SentinelRemoved(id);
    }

    /// @notice Enumerates all sentinel profiles and their identifiers.
    /// @dev Order follows insertion order which keeps responses stable for pagination.
    function listSentinels() external view returns (SentinelView[] memory) {
        uint256 length = _sentinelIndex.length;
        SentinelView[] memory result = new SentinelView[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes32 id = _sentinelIndex[i];
            result[i] = SentinelView({id: id, profile: _sentinels[id]});
        }
        return result;
    }

    /// @notice Returns the domains assigned to a sentinel identifier.
    /// @dev Reverts with {UnknownSentinel} to prevent leaking empty arrays for invalid IDs.
    function getSentinelDomains(bytes32 id) external view returns (bytes32[] memory) {
        if (!_knownSentinel[id]) revert UnknownSentinel(id);
        return _sentinelDomainBindings[id];
    }

    /// ---------------------------------------------------------------------
    /// Capital stream management
    /// ---------------------------------------------------------------------

    /// @notice Registers a capital stream describing treasury allocations for a domain cluster.
    /// @dev Emits {CapitalStreamRegistered} and returns the deterministic identifier derived from the slug.
    function registerCapitalStream(CapitalStream calldata stream) external onlyGovernance returns (bytes32 id) {
        _validateStream(stream);
        id = _idFor(stream.slug);
        if (_knownStream[id]) revert DuplicateStream(id);
        _capitalStreams[id] = stream;
        _knownStream[id] = true;
        _streamIndex.push(id);
        emit CapitalStreamRegistered(id, stream);
    }

    /// @notice Rewrites an existing capital stream configuration.
    /// @dev Enforces slug stability so governance cannot accidentally re-key streams.
    function updateCapitalStream(bytes32 id, CapitalStream calldata stream) external onlyGovernance {
        if (!_knownStream[id]) revert UnknownStream(id);
        _validateStream(stream);
        if (id != _idFor(stream.slug)) {
            revert DuplicateStream(_idFor(stream.slug));
        }
        _capitalStreams[id] = stream;
        emit CapitalStreamUpdated(id, stream);
    }

    /// @notice Toggles whether a capital stream is actively distributing funds.
    /// @dev Emits {CapitalStreamStatusChanged} when the state flips.
    function setCapitalStreamStatus(bytes32 id, bool active) external onlyGovernance {
        if (!_knownStream[id]) revert UnknownStream(id);
        CapitalStream storage stream = _capitalStreams[id];
        if (stream.active == active) {
            return;
        }
        stream.active = active;
        emit CapitalStreamStatusChanged(id, active);
    }

    /// @notice Assigns the domains a capital stream supplies.
    /// @dev Emits {CapitalStreamDomainsUpdated} with the complete set for deterministic indexing.
    function setCapitalStreamDomains(bytes32 id, bytes32[] calldata domainIds) external onlyGovernance {
        if (!_knownStream[id]) revert UnknownStream(id);
        _validateBindingSet(domainIds);
        delete _streamDomainBindings[id];
        bytes32[] storage bindings = _streamDomainBindings[id];
        for (uint256 i = 0; i < domainIds.length; i++) {
            bindings.push(domainIds[i]);
        }
        emit CapitalStreamDomainsUpdated(id, domainIds);
    }

    /// @notice Removes a capital stream and clears all associated domain bindings.
    /// @dev Emits {CapitalStreamRemoved} and cleans up indexes to keep enumeration tight.
    function removeCapitalStream(bytes32 id) external onlyGovernance {
        if (!_knownStream[id]) revert UnknownStream(id);
        delete _capitalStreams[id];
        delete _streamDomainBindings[id];
        _knownStream[id] = false;
        _removeIndexEntry(_streamIndex, id);
        emit CapitalStreamRemoved(id);
    }

    /// @notice Enumerates all capital streams and their identifiers.
    /// @dev Consumers should treat the returned array as authoritative ordering for pagination.
    function listCapitalStreams() external view returns (CapitalStreamView[] memory) {
        uint256 length = _streamIndex.length;
        CapitalStreamView[] memory result = new CapitalStreamView[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes32 id = _streamIndex[i];
            result[i] = CapitalStreamView({id: id, stream: _capitalStreams[id]});
        }
        return result;
    }

    /// @notice Fetches the domain bindings for a capital stream identifier.
    /// @dev Reverts with {UnknownStream} so callers avoid relying on empty arrays for validation.
    function getCapitalStreamDomains(bytes32 id) external view returns (bytes32[] memory) {
        if (!_knownStream[id]) revert UnknownStream(id);
        return _streamDomainBindings[id];
    }

    /// ---------------------------------------------------------------------
    /// Internal helpers
    /// ---------------------------------------------------------------------

    function _validateGlobalParameters(GlobalParameters calldata params) private pure {
        if (params.treasury == address(0)) revert InvalidAddress("treasury", params.treasury);
        if (params.universalVault == address(0)) revert InvalidAddress("universalVault", params.universalVault);
        if (params.upgradeCoordinator == address(0)) {
            revert InvalidAddress("upgradeCoordinator", params.upgradeCoordinator);
        }
        if (params.validatorRegistry == address(0)) revert InvalidAddress("validatorRegistry", params.validatorRegistry);
        if (params.missionControl == address(0)) revert InvalidAddress("missionControl", params.missionControl);
        if (params.knowledgeGraph == address(0)) revert InvalidAddress("knowledgeGraph", params.knowledgeGraph);
        if (params.heartbeatSeconds == 0 || params.guardianReviewWindow == 0) revert InvalidHeartbeat();
        if (params.maxDrawdownBps > 10_000) revert InvalidBps(params.maxDrawdownBps);
        if (bytes(params.manifestoURI).length == 0) revert ManifestRequired();
    }

    function _validateDomain(ValueDomain calldata config) private pure {
        if (bytes(config.slug).length == 0) revert EmptySlug();
        if (bytes(config.name).length == 0) revert EmptyName();
        if (bytes(config.metadataURI).length == 0) revert InvalidURI("metadataURI");
        if (config.orchestrator == address(0)) revert InvalidAddress("orchestrator", config.orchestrator);
        if (config.capitalVault == address(0)) revert InvalidAddress("capitalVault", config.capitalVault);
        if (config.validatorModule == address(0)) revert InvalidAddress("validatorModule", config.validatorModule);
        if (config.policyKernel == address(0)) revert InvalidAddress("policyKernel", config.policyKernel);
        if (config.autonomyLevelBps > 10_000) revert InvalidBps(config.autonomyLevelBps);
        if (config.heartbeatSeconds == 0) revert InvalidHeartbeat();
    }

    function _validateSentinel(SentinelProfile calldata profile) private pure {
        if (bytes(profile.slug).length == 0) revert EmptySlug();
        if (bytes(profile.name).length == 0) revert EmptyName();
        if (bytes(profile.uri).length == 0) revert InvalidURI("uri");
        if (profile.agent == address(0)) revert InvalidAddress("agent", profile.agent);
        if (profile.coverageSeconds == 0) revert InvalidHeartbeat();
        if (profile.sensitivityBps > 10_000) revert InvalidBps(profile.sensitivityBps);
    }

    function _validateStream(CapitalStream calldata stream) private pure {
        if (bytes(stream.slug).length == 0) revert EmptySlug();
        if (bytes(stream.name).length == 0) revert EmptyName();
        if (bytes(stream.uri).length == 0) revert InvalidURI("uri");
        if (stream.vault == address(0)) revert InvalidAddress("vault", stream.vault);
        if (stream.expansionBps > 10_000) revert InvalidBps(stream.expansionBps);
    }

    function _validateSelfImprovementPlan(SelfImprovementPlan calldata plan) private pure {
        if (bytes(plan.planURI).length == 0) revert InvalidURI("planURI");
        if (plan.planHash == bytes32(0)) revert InvalidPlanHash();
        if (plan.cadenceSeconds == 0) revert InvalidCadence(plan.cadenceSeconds);
        if (plan.lastExecutedAt != 0 && plan.lastExecutedAt > type(uint64).max) {
            revert InvalidExecutionTimestamp(plan.lastExecutedAt);
        }
        if (bytes(plan.lastReportURI).length == 0 && plan.lastExecutedAt != 0) {
            revert InvalidURI("lastReportURI");
        }
    }

    function _idFor(string memory slug) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(_normalize(slug)));
    }

    function _normalize(string memory slug) private pure returns (string memory) {
        bytes memory input = bytes(slug);
        for (uint256 i = 0; i < input.length; i++) {
            uint8 char = uint8(input[i]);
            if (char >= 0x41 && char <= 0x5A) {
                input[i] = bytes1(char + 32);
            }
        }
        return string(input);
    }

    function _removeIndexEntry(bytes32[] storage index, bytes32 id) private {
        uint256 length = index.length;
        for (uint256 i = 0; i < length; i++) {
            if (index[i] == id) {
                if (i != length - 1) {
                    index[i] = index[length - 1];
                }
                index.pop();
                break;
            }
        }
    }

    function _validateBindingSet(bytes32[] calldata domainIds) private view {
        for (uint256 i = 0; i < domainIds.length; i++) {
            bytes32 domainId = domainIds[i];
            if (!_knownDomain[domainId]) revert UnknownDomain(domainId);
            for (uint256 j = 0; j < i; j++) {
                if (domainIds[j] == domainId) revert DuplicateBinding(domainId);
            }
        }
    }

    function _pruneBindings(
        mapping(bytes32 => bytes32[]) storage bindings,
        bytes32[] storage index,
        bytes32 domainId
    ) private {
        uint256 length = index.length;
        for (uint256 i = 0; i < length; i++) {
            bytes32 key = index[i];
            bytes32[] storage domains = bindings[key];
            uint256 j = 0;
            while (j < domains.length) {
                if (domains[j] == domainId) {
                    domains[j] = domains[domains.length - 1];
                    domains.pop();
                } else {
                    unchecked {
                        j++;
                    }
                }
            }
        }
    }
}
