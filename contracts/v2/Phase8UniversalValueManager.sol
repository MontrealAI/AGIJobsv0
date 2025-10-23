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

    string public constant SPEC_VERSION = "phase8.universal-value.v1";

    GlobalParameters public globalParameters;
    address public guardianCouncil;
    SystemPause public systemPause;

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
    error InvalidAddress(string field, address provided);
    error InvalidHeartbeat();
    error InvalidBps(uint256 provided);
    error InvalidURI(string field);
    error ManifestRequired();

    /// ---------------------------------------------------------------------
    /// Events
    /// ---------------------------------------------------------------------

    event GlobalParametersUpdated(GlobalParameters params);
    event GuardianCouncilUpdated(address indexed council);
    event SystemPauseUpdated(address indexed systemPause);
    event PauseCallForwarded(address indexed target, bytes data, bytes response);

    event DomainRegistered(bytes32 indexed id, ValueDomain domain);
    event DomainUpdated(bytes32 indexed id, ValueDomain domain);
    event DomainStatusChanged(bytes32 indexed id, bool active);
    event DomainLimitsUpdated(bytes32 indexed id, uint256 tvlLimit, uint256 autonomyLevelBps, uint64 heartbeatSeconds);

    event SentinelRegistered(bytes32 indexed id, SentinelProfile profile);
    event SentinelUpdated(bytes32 indexed id, SentinelProfile profile);
    event SentinelStatusChanged(bytes32 indexed id, bool active);
    event SentinelDomainsUpdated(bytes32 indexed id, bytes32[] domainIds);
    event SentinelRemoved(bytes32 indexed id);

    event CapitalStreamRegistered(bytes32 indexed id, CapitalStream stream);
    event CapitalStreamUpdated(bytes32 indexed id, CapitalStream stream);
    event CapitalStreamStatusChanged(bytes32 indexed id, bool active);
    event CapitalStreamDomainsUpdated(bytes32 indexed id, bytes32[] domainIds);
    event CapitalStreamRemoved(bytes32 indexed id);

    event DomainRemoved(bytes32 indexed id);

    constructor(address initialGovernance) Governable(initialGovernance) {}

    /// ---------------------------------------------------------------------
    /// Global configuration management
    /// ---------------------------------------------------------------------

    function setGlobalParameters(GlobalParameters calldata params) external onlyGovernance {
        _validateGlobalParameters(params);
        globalParameters = params;
        emit GlobalParametersUpdated(params);
    }

    function setGuardianCouncil(address council) external onlyGovernance {
        if (council == address(0)) revert InvalidAddress("guardianCouncil", council);
        guardianCouncil = council;
        emit GuardianCouncilUpdated(council);
    }

    function setSystemPause(address newPause) external onlyGovernance {
        if (newPause == address(0) || newPause.code.length == 0) {
            revert InvalidAddress("systemPause", newPause);
        }
        systemPause = SystemPause(payable(newPause));
        emit SystemPauseUpdated(newPause);
    }

    function updateManifesto(string calldata newManifestoURI) external onlyGovernance {
        if (bytes(newManifestoURI).length == 0) revert ManifestRequired();
        GlobalParameters memory params = globalParameters;
        params.manifestoURI = newManifestoURI;
        globalParameters = params;
        emit GlobalParametersUpdated(params);
    }

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

    function forwardPauseCall(bytes calldata data) external onlyGovernance nonReentrant returns (bytes memory) {
        address pauseTarget = address(systemPause);
        if (pauseTarget == address(0)) revert InvalidAddress("systemPause", pauseTarget);
        bytes memory response = pauseTarget.functionCall(data);
        emit PauseCallForwarded(pauseTarget, data, response);
        return response;
    }

    /// ---------------------------------------------------------------------
    /// Domain registry management
    /// ---------------------------------------------------------------------

    function registerDomain(ValueDomain calldata config) external onlyGovernance returns (bytes32 id) {
        _validateDomain(config);
        id = _idFor(config.slug);
        if (_knownDomain[id]) revert DuplicateDomain(id);
        _domains[id] = config;
        _knownDomain[id] = true;
        _domainIndex.push(id);
        emit DomainRegistered(id, config);
    }

    function updateDomain(bytes32 id, ValueDomain calldata config) external onlyGovernance {
        if (!_knownDomain[id]) revert UnknownDomain(id);
        _validateDomain(config);
        if (id != _idFor(config.slug)) {
            revert DuplicateDomain(_idFor(config.slug));
        }
        _domains[id] = config;
        emit DomainUpdated(id, config);
    }

    function removeDomain(bytes32 id) external onlyGovernance {
        if (!_knownDomain[id]) revert UnknownDomain(id);
        delete _domains[id];
        _knownDomain[id] = false;
        _removeIndexEntry(_domainIndex, id);
        _pruneBindings(_sentinelDomainBindings, _sentinelIndex, id);
        _pruneBindings(_streamDomainBindings, _streamIndex, id);
        emit DomainRemoved(id);
    }

    function setDomainStatus(bytes32 id, bool active) external onlyGovernance {
        if (!_knownDomain[id]) revert UnknownDomain(id);
        ValueDomain storage domain = _domains[id];
        if (domain.active == active) {
            return;
        }
        domain.active = active;
        emit DomainStatusChanged(id, active);
    }

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

    function listDomains() external view returns (DomainView[] memory) {
        uint256 length = _domainIndex.length;
        DomainView[] memory result = new DomainView[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes32 id = _domainIndex[i];
            result[i] = DomainView({id: id, config: _domains[id]});
        }
        return result;
    }

    function getDomain(bytes32 id) external view returns (ValueDomain memory) {
        if (!_knownDomain[id]) revert UnknownDomain(id);
        return _domains[id];
    }

    /// ---------------------------------------------------------------------
    /// Sentinel registry management
    /// ---------------------------------------------------------------------

    function registerSentinel(SentinelProfile calldata profile) external onlyGovernance returns (bytes32 id) {
        _validateSentinel(profile);
        id = _idFor(profile.slug);
        if (_knownSentinel[id]) revert DuplicateSentinel(id);
        _sentinels[id] = profile;
        _knownSentinel[id] = true;
        _sentinelIndex.push(id);
        emit SentinelRegistered(id, profile);
    }

    function updateSentinel(bytes32 id, SentinelProfile calldata profile) external onlyGovernance {
        if (!_knownSentinel[id]) revert UnknownSentinel(id);
        _validateSentinel(profile);
        if (id != _idFor(profile.slug)) {
            revert DuplicateSentinel(_idFor(profile.slug));
        }
        _sentinels[id] = profile;
        emit SentinelUpdated(id, profile);
    }

    function setSentinelStatus(bytes32 id, bool active) external onlyGovernance {
        if (!_knownSentinel[id]) revert UnknownSentinel(id);
        SentinelProfile storage sentinel = _sentinels[id];
        if (sentinel.active == active) {
            return;
        }
        sentinel.active = active;
        emit SentinelStatusChanged(id, active);
    }

    function setSentinelDomains(bytes32 id, bytes32[] calldata domainIds) external onlyGovernance {
        if (!_knownSentinel[id]) revert UnknownSentinel(id);
        for (uint256 i = 0; i < domainIds.length; i++) {
            if (!_knownDomain[domainIds[i]]) revert UnknownDomain(domainIds[i]);
        }
        delete _sentinelDomainBindings[id];
        bytes32[] storage bindings = _sentinelDomainBindings[id];
        for (uint256 i = 0; i < domainIds.length; i++) {
            bindings.push(domainIds[i]);
        }
        emit SentinelDomainsUpdated(id, domainIds);
    }

    function removeSentinel(bytes32 id) external onlyGovernance {
        if (!_knownSentinel[id]) revert UnknownSentinel(id);
        delete _sentinels[id];
        delete _sentinelDomainBindings[id];
        _knownSentinel[id] = false;
        _removeIndexEntry(_sentinelIndex, id);
        emit SentinelRemoved(id);
    }

    function listSentinels() external view returns (SentinelView[] memory) {
        uint256 length = _sentinelIndex.length;
        SentinelView[] memory result = new SentinelView[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes32 id = _sentinelIndex[i];
            result[i] = SentinelView({id: id, profile: _sentinels[id]});
        }
        return result;
    }

    function getSentinelDomains(bytes32 id) external view returns (bytes32[] memory) {
        if (!_knownSentinel[id]) revert UnknownSentinel(id);
        return _sentinelDomainBindings[id];
    }

    /// ---------------------------------------------------------------------
    /// Capital stream management
    /// ---------------------------------------------------------------------

    function registerCapitalStream(CapitalStream calldata stream) external onlyGovernance returns (bytes32 id) {
        _validateStream(stream);
        id = _idFor(stream.slug);
        if (_knownStream[id]) revert DuplicateStream(id);
        _capitalStreams[id] = stream;
        _knownStream[id] = true;
        _streamIndex.push(id);
        emit CapitalStreamRegistered(id, stream);
    }

    function updateCapitalStream(bytes32 id, CapitalStream calldata stream) external onlyGovernance {
        if (!_knownStream[id]) revert UnknownStream(id);
        _validateStream(stream);
        if (id != _idFor(stream.slug)) {
            revert DuplicateStream(_idFor(stream.slug));
        }
        _capitalStreams[id] = stream;
        emit CapitalStreamUpdated(id, stream);
    }

    function setCapitalStreamStatus(bytes32 id, bool active) external onlyGovernance {
        if (!_knownStream[id]) revert UnknownStream(id);
        CapitalStream storage stream = _capitalStreams[id];
        if (stream.active == active) {
            return;
        }
        stream.active = active;
        emit CapitalStreamStatusChanged(id, active);
    }

    function setCapitalStreamDomains(bytes32 id, bytes32[] calldata domainIds) external onlyGovernance {
        if (!_knownStream[id]) revert UnknownStream(id);
        for (uint256 i = 0; i < domainIds.length; i++) {
            if (!_knownDomain[domainIds[i]]) revert UnknownDomain(domainIds[i]);
        }
        delete _streamDomainBindings[id];
        bytes32[] storage bindings = _streamDomainBindings[id];
        for (uint256 i = 0; i < domainIds.length; i++) {
            bindings.push(domainIds[i]);
        }
        emit CapitalStreamDomainsUpdated(id, domainIds);
    }

    function removeCapitalStream(bytes32 id) external onlyGovernance {
        if (!_knownStream[id]) revert UnknownStream(id);
        delete _capitalStreams[id];
        delete _streamDomainBindings[id];
        _knownStream[id] = false;
        _removeIndexEntry(_streamIndex, id);
        emit CapitalStreamRemoved(id);
    }

    function listCapitalStreams() external view returns (CapitalStreamView[] memory) {
        uint256 length = _streamIndex.length;
        CapitalStreamView[] memory result = new CapitalStreamView[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes32 id = _streamIndex[i];
            result[i] = CapitalStreamView({id: id, stream: _capitalStreams[id]});
        }
        return result;
    }

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
