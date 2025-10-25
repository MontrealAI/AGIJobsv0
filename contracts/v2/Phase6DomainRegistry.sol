// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Phase6DomainRegistry
/// @notice Tracks multi-domain skill taxonomies, credential requirements and
///         agent roster metadata for Phase 6.
/// @dev Governance retains absolute control over domain definitions, skill
///      lifecycles and agent approvals. Agents self-register their DID/VC
///      payloads which are then surfaced to the subgraph and orchestrators.
contract Phase6DomainRegistry is Governable, ReentrancyGuard {
    struct Domain {
        string slug;
        string name;
        string metadataURI;
        bytes32 manifestHash;
        bool active;
        uint64 registeredAt;
        uint64 updatedAt;
    }

    struct DomainView {
        bytes32 id;
        Domain config;
    }

    struct CredentialRule {
        address attestor;
        bytes32 schemaId;
        string uri;
        bool requiresCredential;
        bool active;
        uint64 updatedAt;
    }

    struct Skill {
        string key;
        string label;
        string metadataURI;
        bool requiresCredential;
        bool active;
        uint64 registeredAt;
        uint64 updatedAt;
    }

    struct SkillView {
        bytes32 id;
        Skill config;
    }

    struct AgentProfile {
        string didURI;
        bytes32 manifestHash;
        bytes32 credentialHash;
        uint64 registeredAt;
        uint64 updatedAt;
        bool active;
        bool approved;
        address submitter;
    }

    struct AgentRegistration {
        string domain;
        string didURI;
        bytes32 manifestHash;
        bytes32 credentialHash;
        string[] skills;
    }

    event DomainRegistered(bytes32 indexed id, string slug, string name, string metadataURI, bytes32 manifestHash);
    event DomainUpdated(bytes32 indexed id, string slug, string name, string metadataURI, bytes32 manifestHash, bool active);
    event DomainStatusChanged(bytes32 indexed id, bool active);
    event CredentialRuleUpdated(
        bytes32 indexed domainId,
        address indexed attestor,
        bytes32 schemaId,
        string uri,
        bool requiresCredential,
        bool active
    );
    event SkillRegistered(
        bytes32 indexed domainId,
        bytes32 indexed skillId,
        string key,
        string label,
        string metadataURI,
        bool requiresCredential
    );
    event SkillUpdated(
        bytes32 indexed domainId,
        bytes32 indexed skillId,
        string key,
        string label,
        string metadataURI,
        bool requiresCredential,
        bool active
    );
    event AgentProfileRegistered(bytes32 indexed domainId, address indexed agent, string didURI, bytes32 manifestHash);
    event AgentProfileUpdated(bytes32 indexed domainId, address indexed agent, string didURI, bytes32 manifestHash);
    event AgentProfileApproval(bytes32 indexed domainId, address indexed agent, bool approved);
    event AgentProfileStatus(bytes32 indexed domainId, address indexed agent, bool active);
    event AgentSkillsSnapshot(bytes32 indexed domainId, address indexed agent, bytes32[] skillIds);

    error EmptySlug();
    error EmptySkillKey();
    error EmptyName();
    error EmptyMetadata();
    error EmptyURI();
    error InvalidManifestHash();
    error InvalidSchema();
    error DuplicateDomain(bytes32 id);
    error UnknownDomain(bytes32 id);
    error UnknownSkill(bytes32 id);
    error DuplicateSkill(bytes32 id);
    error SkillInactive(bytes32 id);
    error CredentialRequired(bytes32 domainId);
    error DomainInactive(bytes32 id);
    error DuplicateAgentSkill(bytes32 id);
    error InvalidAgent();

    mapping(bytes32 => Domain) private _domains;
    mapping(bytes32 => bool) private _knownDomain;
    bytes32[] private _domainIndex;

    mapping(bytes32 => CredentialRule) private _credentialRules;

    mapping(bytes32 => mapping(bytes32 => Skill)) private _skills;
    mapping(bytes32 => bytes32[]) private _skillIndex;

    mapping(address => mapping(bytes32 => AgentProfile)) private _agentProfiles;
    mapping(address => mapping(bytes32 => bytes32[])) private _agentSkillIndex;
    mapping(address => mapping(bytes32 => mapping(bytes32 => bool))) private _agentSkillAssignments;

    constructor(address governance) Governable(governance) {}

    function registerDomain(
        string calldata slug,
        string calldata name,
        string calldata metadataURI,
        bytes32 manifestHash,
        bool active
    ) external onlyGovernance returns (bytes32 id) {
        _validateSlug(slug);
        _validateName(name);
        _validateMetadata(metadataURI);
        if (manifestHash == bytes32(0)) revert InvalidManifestHash();
        id = _idFor(slug);
        if (_knownDomain[id]) revert DuplicateDomain(id);
        Domain storage domain = _domains[id];
        domain.slug = _normalize(slug);
        domain.name = name;
        domain.metadataURI = metadataURI;
        domain.manifestHash = manifestHash;
        domain.active = active;
        domain.registeredAt = uint64(block.timestamp);
        domain.updatedAt = uint64(block.timestamp);
        _knownDomain[id] = true;
        _domainIndex.push(id);
        emit DomainRegistered(id, domain.slug, domain.name, domain.metadataURI, domain.manifestHash);
        emit DomainUpdated(id, domain.slug, domain.name, domain.metadataURI, domain.manifestHash, active);
    }

    function updateDomain(
        bytes32 id,
        string calldata name,
        string calldata metadataURI,
        bytes32 manifestHash,
        bool active
    ) external onlyGovernance {
        Domain storage domain = _domains[id];
        if (!_knownDomain[id]) revert UnknownDomain(id);
        _validateName(name);
        _validateMetadata(metadataURI);
        if (manifestHash == bytes32(0)) revert InvalidManifestHash();
        domain.name = name;
        domain.metadataURI = metadataURI;
        domain.manifestHash = manifestHash;
        domain.active = active;
        domain.updatedAt = uint64(block.timestamp);
        emit DomainUpdated(id, domain.slug, name, metadataURI, manifestHash, active);
    }

    function setDomainStatus(bytes32 id, bool active) external onlyGovernance {
        Domain storage domain = _domains[id];
        if (!_knownDomain[id]) revert UnknownDomain(id);
        if (domain.active == active) {
            return;
        }
        domain.active = active;
        domain.updatedAt = uint64(block.timestamp);
        emit DomainStatusChanged(id, active);
    }

    function setCredentialRule(bytes32 domainKey, CredentialRule calldata rule) external onlyGovernance {
        if (!_knownDomain[domainKey]) revert UnknownDomain(domainKey);
        if (rule.requiresCredential) {
            if (rule.attestor == address(0)) revert InvalidAgent();
            if (rule.schemaId == bytes32(0)) revert InvalidSchema();
            _validateURI(rule.uri);
        }
        CredentialRule storage stored = _credentialRules[domainKey];
        stored.attestor = rule.attestor;
        stored.schemaId = rule.schemaId;
        stored.uri = rule.uri;
        stored.requiresCredential = rule.requiresCredential;
        stored.active = rule.active;
        stored.updatedAt = uint64(block.timestamp);
        emit CredentialRuleUpdated(domainKey, rule.attestor, rule.schemaId, rule.uri, rule.requiresCredential, rule.active);
    }

    function registerSkill(
        bytes32 domainKey,
        string calldata key,
        string calldata label,
        string calldata metadataURI,
        bool requiresCredential
    ) external onlyGovernance returns (bytes32 id) {
        if (!_knownDomain[domainKey]) revert UnknownDomain(domainKey);
        _validateSkillKey(key);
        _validateName(label);
        _validateMetadata(metadataURI);
        id = _skillIdFor(key);
        if (_skills[domainKey][id].registeredAt != 0) revert DuplicateSkill(id);
        Skill storage skill = _skills[domainKey][id];
        skill.key = _normalize(key);
        skill.label = label;
        skill.metadataURI = metadataURI;
        skill.requiresCredential = requiresCredential;
        skill.active = true;
        skill.registeredAt = uint64(block.timestamp);
        skill.updatedAt = uint64(block.timestamp);
        _skillIndex[domainKey].push(id);
        emit SkillRegistered(domainKey, id, skill.key, label, metadataURI, requiresCredential);
        emit SkillUpdated(domainKey, id, skill.key, label, metadataURI, requiresCredential, true);
    }

    function updateSkill(
        bytes32 domainKey,
        string calldata key,
        string calldata label,
        string calldata metadataURI,
        bool requiresCredential,
        bool active
    ) external onlyGovernance {
        if (!_knownDomain[domainKey]) revert UnknownDomain(domainKey);
        _validateSkillKey(key);
        _validateName(label);
        _validateMetadata(metadataURI);
        bytes32 id = _skillIdFor(key);
        Skill storage skill = _skills[domainKey][id];
        if (skill.registeredAt == 0) revert UnknownSkill(id);
        skill.key = _normalize(key);
        skill.label = label;
        skill.metadataURI = metadataURI;
        skill.requiresCredential = requiresCredential;
        skill.active = active;
        skill.updatedAt = uint64(block.timestamp);
        emit SkillUpdated(domainKey, id, skill.key, label, metadataURI, requiresCredential, active);
    }

    function registerAgentProfile(AgentRegistration calldata registration) external nonReentrant {
        _registerAgent(msg.sender, registration);
    }

    function registerAgentProfileFor(address agent, AgentRegistration calldata registration) external onlyGovernance {
        if (agent == address(0)) revert InvalidAgent();
        _registerAgent(agent, registration);
    }

    function setAgentApproval(bytes32 domainKey, address agent, bool approved) external onlyGovernance {
        AgentProfile storage profile = _agentProfiles[agent][domainKey];
        if (profile.registeredAt == 0) revert InvalidAgent();
        if (profile.approved == approved) {
            return;
        }
        profile.approved = approved;
        profile.updatedAt = uint64(block.timestamp);
        emit AgentProfileApproval(domainKey, agent, approved);
    }

    function setAgentStatus(bytes32 domainKey, address agent, bool active) external onlyGovernance {
        AgentProfile storage profile = _agentProfiles[agent][domainKey];
        if (profile.registeredAt == 0) revert InvalidAgent();
        if (profile.active == active) {
            return;
        }
        profile.active = active;
        profile.updatedAt = uint64(block.timestamp);
        emit AgentProfileStatus(domainKey, agent, active);
    }

    function getDomain(bytes32 domainKey) external view returns (Domain memory) {
        if (!_knownDomain[domainKey]) revert UnknownDomain(domainKey);
        return _domains[domainKey];
    }

    function getCredentialRule(bytes32 domainKey) external view returns (CredentialRule memory) {
        if (!_knownDomain[domainKey]) revert UnknownDomain(domainKey);
        return _credentialRules[domainKey];
    }

    function listDomains() external view returns (DomainView[] memory domains) {
        uint256 length = _domainIndex.length;
        domains = new DomainView[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes32 id = _domainIndex[i];
            domains[i] = DomainView({id: id, config: _domains[id]});
        }
    }

    function listSkills(bytes32 domainKey) external view returns (SkillView[] memory skills) {
        if (!_knownDomain[domainKey]) revert UnknownDomain(domainKey);
        bytes32[] storage index = _skillIndex[domainKey];
        uint256 length = index.length;
        skills = new SkillView[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes32 id = index[i];
            skills[i] = SkillView({id: id, config: _skills[domainKey][id]});
        }
    }

    function getAgentProfile(address agent, bytes32 domainKey)
        external
        view
        returns (AgentProfile memory profile, bytes32[] memory skillIds)
    {
        profile = _agentProfiles[agent][domainKey];
        if (profile.registeredAt == 0) revert InvalidAgent();
        skillIds = _agentSkillIndex[agent][domainKey];
    }

    function getAgentSkills(address agent, bytes32 domainKey) external view returns (bytes32[] memory skillIds) {
        skillIds = _agentSkillIndex[agent][domainKey];
    }

    function domainId(string calldata slug) external pure returns (bytes32) {
        return _idFor(slug);
    }

    function skillId(string calldata key) external pure returns (bytes32) {
        return _skillIdFor(key);
    }

    function _registerAgent(address agent, AgentRegistration calldata registration) private {
        if (agent == address(0)) revert InvalidAgent();
        bytes32 domainKey = _idFor(registration.domain);
        if (!_knownDomain[domainKey]) revert UnknownDomain(domainKey);
        Domain storage domain = _domains[domainKey];
        if (!domain.active) revert DomainInactive(domainKey);
        AgentProfile storage profile = _agentProfiles[agent][domainKey];
        CredentialRule storage rule = _credentialRules[domainKey];
        if (rule.active && rule.requiresCredential && registration.credentialHash == bytes32(0)) {
            revert CredentialRequired(domainKey);
        }
        _validateMetadata(registration.didURI);
        profile.didURI = registration.didURI;
        profile.manifestHash = registration.manifestHash;
        profile.credentialHash = registration.credentialHash;
        bool isNew = profile.registeredAt == 0;
        if (isNew) {
            profile.registeredAt = uint64(block.timestamp);
            profile.active = true;
            profile.approved = false;
        }
        profile.submitter = msg.sender;
        profile.updatedAt = uint64(block.timestamp);
        if (isNew) {
            emit AgentProfileRegistered(domainKey, agent, registration.didURI, registration.manifestHash);
        }

        bytes32[] storage previous = _agentSkillIndex[agent][domainKey];
        uint256 previousLength = previous.length;
        for (uint256 i = 0; i < previousLength; i++) {
            bytes32 prevSkill = previous[i];
            _agentSkillAssignments[agent][domainKey][prevSkill] = false;
        }
        delete _agentSkillIndex[agent][domainKey];

        uint256 skillCount = registration.skills.length;
        bytes32[] memory newSkills = new bytes32[](skillCount);
        for (uint256 i = 0; i < skillCount; i++) {
            string memory key = registration.skills[i];
            _validateSkillKey(key);
            bytes32 skillKey = _skillIdFor(key);
            Skill storage skill = _skills[domainKey][skillKey];
            if (skill.registeredAt == 0) revert UnknownSkill(skillKey);
            if (!skill.active) revert SkillInactive(skillKey);
            if (_agentSkillAssignments[agent][domainKey][skillKey]) revert DuplicateAgentSkill(skillKey);
            if (skill.requiresCredential && registration.credentialHash == bytes32(0)) {
                revert CredentialRequired(domainKey);
            }
            _agentSkillIndex[agent][domainKey].push(skillKey);
            _agentSkillAssignments[agent][domainKey][skillKey] = true;
            newSkills[i] = skillKey;
        }
        emit AgentSkillsSnapshot(domainKey, agent, newSkills);
        emit AgentProfileUpdated(domainKey, agent, registration.didURI, registration.manifestHash);
    }

    function _validateSlug(string memory slug) private pure {
        if (bytes(slug).length == 0) revert EmptySlug();
    }

    function _validateName(string memory name) private pure {
        if (bytes(name).length == 0) revert EmptyName();
    }

    function _validateMetadata(string memory uri) private pure {
        if (bytes(uri).length == 0) revert EmptyMetadata();
    }

    function _validateURI(string memory uri) private pure {
        if (bytes(uri).length == 0) revert EmptyURI();
    }

    function _validateSkillKey(string memory key) private pure {
        if (bytes(key).length == 0) revert EmptySkillKey();
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

    function _idFor(string memory slug) private pure returns (bytes32) {
        if (bytes(slug).length == 0) revert EmptySlug();
        return keccak256(bytes(_normalize(slug)));
    }

    function _skillIdFor(string memory key) private pure returns (bytes32) {
        if (bytes(key).length == 0) revert EmptySkillKey();
        return keccak256(bytes(_normalize(key)));
    }
}
