// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IDomainRegistry} from "./interfaces/IDomainRegistry.sol";

/// @title DomainRegistry
/// @notice Tracks industry specific execution domains and their runtime wiring.
/// @dev Governance maintains absolute control over domain lifecycle and
///      runtime connectors ensuring non-technical operators can steer the
///      platform safely during Phase 6 scale out.
contract DomainRegistry is Governable, Pausable, IDomainRegistry {
    struct DomainProfile {
        string name;
        string slug;
        string metadataURI;
        bytes32 credentialSchema;
        bytes32 l2Network;
        address dispatcher;
        address oracle;
        address bridge;
        address l2Gateway;
        uint96 minStake;
        uint32 resilienceFloor;
        uint32 maxConcurrentJobs;
        bool requiresHumanReview;
        bool active;
        bool paused;
    }

    struct DomainInit {
        string name;
        string slug;
        string metadataURI;
        bytes32 credentialSchema;
        bytes32 l2Network;
        address dispatcher;
        address oracle;
        address bridge;
        address l2Gateway;
        uint96 minStake;
        uint32 resilienceFloor;
        uint32 maxConcurrentJobs;
        bool requiresHumanReview;
        bool active;
    }

    mapping(uint256 => DomainProfile) private _domains;
    mapping(bytes32 => uint256) private _slugToId;
    uint256 public nextDomainId;

    error DomainNotFound(uint256 domainId);
    error DuplicateSlug(bytes32 slugHash);
    error EmptyValue();
    event DomainRegistered(uint256 indexed domainId, string name, string slug);
    event DomainMetadataUpdated(uint256 indexed domainId, string name, string metadataURI, bytes32 credentialSchema);
    event DomainRuntimeUpdated(
        uint256 indexed domainId,
        address dispatcher,
        address oracle,
        address bridge,
        address l2Gateway,
        bytes32 l2Network
    );
    event DomainCapsUpdated(
        uint256 indexed domainId,
        uint96 minStake,
        uint32 resilienceFloor,
        uint32 maxConcurrentJobs,
        bool requiresHumanReview
    );
    event DomainStatusUpdated(uint256 indexed domainId, bool active);
    event DomainPaused(uint256 indexed domainId);
    event DomainResumed(uint256 indexed domainId);
    event SlugReassigned(uint256 indexed domainId, string slug);

    constructor(address _governance) Governable(_governance) {}

    function _slugHash(string memory slug) private pure returns (bytes32) {
        return keccak256(bytes(slug));
    }

    function _requireDomain(uint256 domainId) private view returns (DomainProfile storage profile) {
        profile = _domains[domainId];
        if (bytes(profile.slug).length == 0) revert DomainNotFound(domainId);
    }

    function registerDomain(DomainInit calldata init) external onlyGovernance whenNotPaused returns (uint256 domainId) {
        if (bytes(init.name).length == 0) revert EmptyValue();
        if (bytes(init.slug).length == 0) revert EmptyValue();
        bytes32 slugHash = _slugHash(init.slug);
        if (_slugToId[slugHash] != 0) revert DuplicateSlug(slugHash);

        domainId = ++nextDomainId;
        DomainProfile storage profile = _domains[domainId];
        profile.name = init.name;
        profile.slug = init.slug;
        profile.metadataURI = init.metadataURI;
        profile.credentialSchema = init.credentialSchema;
        profile.l2Network = init.l2Network;
        profile.dispatcher = init.dispatcher;
        profile.oracle = init.oracle;
        profile.bridge = init.bridge;
        profile.l2Gateway = init.l2Gateway;
        profile.minStake = init.minStake;
        profile.resilienceFloor = init.resilienceFloor;
        profile.maxConcurrentJobs = init.maxConcurrentJobs;
        profile.requiresHumanReview = init.requiresHumanReview;
        profile.active = init.active;
        profile.paused = false;

        _slugToId[slugHash] = domainId;

        emit DomainRegistered(domainId, init.name, init.slug);
        emit DomainMetadataUpdated(domainId, init.name, init.metadataURI, init.credentialSchema);
        emit DomainRuntimeUpdated(
            domainId,
            init.dispatcher,
            init.oracle,
            init.bridge,
            init.l2Gateway,
            init.l2Network
        );
        emit DomainCapsUpdated(
            domainId,
            init.minStake,
            init.resilienceFloor,
            init.maxConcurrentJobs,
            init.requiresHumanReview
        );
        emit DomainStatusUpdated(domainId, init.active);
    }

    function updateSlug(uint256 domainId, string calldata newSlug) external onlyGovernance whenNotPaused {
        if (bytes(newSlug).length == 0) revert EmptyValue();
        DomainProfile storage profile = _requireDomain(domainId);
        bytes32 newHash = _slugHash(newSlug);
        uint256 existing = _slugToId[newHash];
        if (existing != 0 && existing != domainId) revert DuplicateSlug(newHash);

        bytes32 oldHash = _slugHash(profile.slug);
        delete _slugToId[oldHash];
        _slugToId[newHash] = domainId;
        profile.slug = newSlug;
        emit SlugReassigned(domainId, newSlug);
    }

    function setDomainMetadata(
        uint256 domainId,
        string calldata name,
        string calldata metadataURI,
        bytes32 credentialSchema
    ) external onlyGovernance whenNotPaused {
        if (bytes(name).length == 0) revert EmptyValue();
        DomainProfile storage profile = _requireDomain(domainId);
        profile.name = name;
        profile.metadataURI = metadataURI;
        profile.credentialSchema = credentialSchema;
        emit DomainMetadataUpdated(domainId, name, metadataURI, credentialSchema);
    }

    function setDomainRuntime(
        uint256 domainId,
        address dispatcher,
        address oracle,
        address bridge,
        address l2Gateway,
        bytes32 l2Network
    ) external onlyGovernance whenNotPaused {
        DomainProfile storage profile = _requireDomain(domainId);
        profile.dispatcher = dispatcher;
        profile.oracle = oracle;
        profile.bridge = bridge;
        profile.l2Gateway = l2Gateway;
        profile.l2Network = l2Network;
        emit DomainRuntimeUpdated(domainId, dispatcher, oracle, bridge, l2Gateway, l2Network);
    }

    function setDomainCaps(
        uint256 domainId,
        uint96 minStake,
        uint32 resilienceFloor,
        uint32 maxConcurrentJobs,
        bool requiresHumanReview
    ) external onlyGovernance whenNotPaused {
        DomainProfile storage profile = _requireDomain(domainId);
        profile.minStake = minStake;
        profile.resilienceFloor = resilienceFloor;
        profile.maxConcurrentJobs = maxConcurrentJobs;
        profile.requiresHumanReview = requiresHumanReview;
        emit DomainCapsUpdated(domainId, minStake, resilienceFloor, maxConcurrentJobs, requiresHumanReview);
    }

    function setDomainStatus(uint256 domainId, bool active) external onlyGovernance whenNotPaused {
        DomainProfile storage profile = _requireDomain(domainId);
        profile.active = active;
        emit DomainStatusUpdated(domainId, active);
    }

    function pauseDomain(uint256 domainId) external onlyGovernance {
        DomainProfile storage profile = _requireDomain(domainId);
        if (!profile.paused) {
            profile.paused = true;
            emit DomainPaused(domainId);
        }
    }

    function resumeDomain(uint256 domainId) external onlyGovernance whenNotPaused {
        DomainProfile storage profile = _requireDomain(domainId);
        if (profile.paused) {
            profile.paused = false;
            emit DomainResumed(domainId);
        }
    }

    function domainExists(uint256 domainId) public view returns (bool) {
        return bytes(_domains[domainId].slug).length != 0;
    }

    function slugToDomainId(string calldata slug) external view returns (uint256) {
        return _slugToId[_slugHash(slug)];
    }

    function getDomain(uint256 domainId) public view returns (DomainView memory) {
        DomainProfile memory profile = _domains[domainId];
        if (bytes(profile.slug).length == 0) revert DomainNotFound(domainId);
        return
            DomainView({
                name: profile.name,
                slug: profile.slug,
                metadataURI: profile.metadataURI,
                credentialSchema: profile.credentialSchema,
                l2Network: profile.l2Network,
                dispatcher: profile.dispatcher,
                oracle: profile.oracle,
                bridge: profile.bridge,
                l2Gateway: profile.l2Gateway,
                minStake: profile.minStake,
                resilienceFloor: profile.resilienceFloor,
                maxConcurrentJobs: profile.maxConcurrentJobs,
                requiresHumanReview: profile.requiresHumanReview,
                active: profile.active,
                paused: profile.paused
            });
    }

    function isActive(uint256 domainId) public view returns (bool) {
        DomainProfile memory profile = _domains[domainId];
        if (bytes(profile.slug).length == 0) revert DomainNotFound(domainId);
        if (paused()) return false;
        return profile.active && !profile.paused;
    }

    function pause() external onlyGovernance {
        _pause();
    }

    function unpause() external onlyGovernance {
        _unpause();
    }

    function paused()
        public
        view
        override(Pausable, IDomainRegistry)
        returns (bool)
    {
        return Pausable.paused();
    }
}
