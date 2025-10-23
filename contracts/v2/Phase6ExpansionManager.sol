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

    /// @notice Governance controlled anomaly escalation target.
    address public escalationBridge;

    /// @notice Registry describing which contract receives delegated pause calls.
    SystemPause public systemPause;

    /// @notice Captured immutable identifier for off-chain tooling versioning.
    string public constant SPEC_VERSION = "phase6.expansion.v1";

    /// @notice Current global configuration shared by all domains.
    GlobalConfig public globalConfig;

    mapping(bytes32 => Domain) private _domains;
    mapping(bytes32 => bool) private _known;
    bytes32[] private _domainIndex;

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

    /// -----------------------------------------------------------------------
    /// View helpers
    /// -----------------------------------------------------------------------

    function domainId(string calldata slug) external pure returns (bytes32) {
        return _idFor(slug);
    }

    function getDomain(bytes32 id) external view returns (Domain memory) {
        if (!_known[id]) revert UnknownDomain(id);
        return _domains[id];
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
