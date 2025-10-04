// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable2Step} from "./utils/Ownable2Step.sol";
import {IENS} from "./interfaces/IENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {ENSIdentityVerifier} from "./ENSIdentityVerifier.sol";
import {AttestationRegistry} from "./AttestationRegistry.sol";

error ZeroAddress();
error ZeroNode();
error UnauthorizedAgent();
error EtherNotAccepted();
error IncompatibleReputationEngine();
error EmptySubdomain();

/// @title IdentityRegistry
/// @notice Verifies ENS subdomain ownership and tracks manual allowlists
/// for agents and validators. Provides helper views that also check
/// reputation blacklists.
contract IdentityRegistry is Ownable2Step {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;
    enum AgentType {
        Human,
        AI
    }
    IENS public ens;
    INameWrapper public nameWrapper;
    IReputationEngine public reputationEngine;
    AttestationRegistry public attestationRegistry;

    bytes32 public agentRootNode;
    bytes32 public clubRootNode;
    bytes32 public nodeRootNode;
    bytes32 public agentMerkleRoot;
    bytes32 public validatorMerkleRoot;

    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;
    mapping(address => bool) public additionalNodeOperators;
    mapping(address => AgentType) public agentTypes;
    /// @notice Optional metadata URI describing agent capabilities.
    mapping(address => string) public agentProfileURI;

    bytes32[] private agentRootNodeAliases;
    bytes32[] private clubRootNodeAliases;
    bytes32[] private nodeRootNodeAliases;
    mapping(bytes32 => bool) private agentRootNodeAliasSet;
    mapping(bytes32 => bool) private clubRootNodeAliasSet;
    mapping(bytes32 => bool) private nodeRootNodeAliasSet;

    event ENSUpdated(address indexed ens);
    event NameWrapperUpdated(address indexed nameWrapper);
    event ReputationEngineUpdated(address indexed reputationEngine);
    event AttestationRegistryUpdated(address indexed attestationRegistry);
    event AgentRootNodeUpdated(bytes32 indexed agentRootNode);
    event ClubRootNodeUpdated(bytes32 indexed clubRootNode);
    event NodeRootNodeUpdated(bytes32 indexed nodeRootNode);
    event AgentMerkleRootUpdated(bytes32 indexed agentMerkleRoot);
    event ValidatorMerkleRootUpdated(bytes32 indexed validatorMerkleRoot);
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    event AdditionalValidatorUpdated(address indexed validator, bool allowed);
    event AdditionalNodeOperatorUpdated(address indexed nodeOperator, bool allowed);
    event AdditionalAgentUsed(address indexed agent, string subdomain);
    event AdditionalValidatorUsed(address indexed validator, string subdomain);
    event AdditionalNodeOperatorUsed(address indexed nodeOperator, string subdomain);
    event AgentRootNodeAliasUpdated(bytes32 indexed node, bool allowed);
    event ClubRootNodeAliasUpdated(bytes32 indexed node, bool allowed);
    event NodeRootNodeAliasUpdated(bytes32 indexed node, bool allowed);
    event IdentityVerified(
        address indexed user,
        AttestationRegistry.Role indexed role,
        bytes32 indexed node,
        string subdomain
    );
    event ENSVerified(
        address indexed user,
        bytes32 indexed node,
        string label,
        bool viaWrapper,
        bool viaMerkle
    );
    /// @notice Emitted when a verification attempt fails.
    event IdentityVerificationFailed(
        address indexed user,
        AttestationRegistry.Role indexed role,
        string subdomain
    );
    event AgentTypeUpdated(address indexed agent, AgentType agentType);
    /// @notice Emitted when an agent updates their profile metadata.
    event AgentProfileUpdated(address indexed agent, string uri);
    event MainnetConfigured(
        address indexed ens,
        address indexed nameWrapper,
        bytes32 indexed agentRoot,
        bytes32 clubRoot,
        bytes32 nodeRoot
    );

    event ConfigurationApplied(
        address indexed caller,
        bool ensUpdated,
        bool nameWrapperUpdated,
        bool reputationEngineUpdated,
        bool attestationRegistryUpdated,
        bool agentRootUpdated,
        bool clubRootUpdated,
        bool nodeRootUpdated,
        bool agentMerkleRootUpdated,
        bool validatorMerkleRootUpdated,
        uint256 additionalAgentUpdates,
        uint256 additionalValidatorUpdates,
        uint256 additionalNodeUpdates,
        uint256 agentTypeUpdates
    );

    struct ConfigUpdate {
        bool setENS;
        address ens;
        bool setNameWrapper;
        address nameWrapper;
        bool setReputationEngine;
        address reputationEngine;
        bool setAttestationRegistry;
        address attestationRegistry;
        bool setAgentRootNode;
        bytes32 agentRootNode;
        bool setClubRootNode;
        bytes32 clubRootNode;
        bool setNodeRootNode;
        bytes32 nodeRootNode;
        bool setAgentMerkleRoot;
        bytes32 agentMerkleRoot;
        bool setValidatorMerkleRoot;
        bytes32 validatorMerkleRoot;
    }

    function _assertSubdomain(string memory subdomain) private pure {
        if (bytes(subdomain).length == 0) revert EmptySubdomain();
    }

    struct AdditionalAgentConfig {
        address agent;
        bool allowed;
    }

    struct AdditionalValidatorConfig {
        address validator;
        bool allowed;
    }

    struct AdditionalNodeOperatorConfig {
        address nodeOperator;
        bool allowed;
    }

    struct AgentTypeConfig {
        address agent;
        AgentType agentType;
    }

    struct RootNodeAliasConfig {
        bytes32 node;
        bool allowed;
    }

    address public constant MAINNET_ENS =
        0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;
    address public constant MAINNET_NAME_WRAPPER =
        0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401;
    bytes32 public constant MAINNET_AGENT_ROOT_NODE =
        0x2c9c6189b2e92da4d0407e9deb38ff6870729ad063af7e8576cb7b7898c88e2d;
    bytes32 public constant MAINNET_CLUB_ROOT_NODE =
        0x39eb848f88bdfb0a6371096249dd451f56859dfe2cd3ddeab1e26d5bb68ede16;
    bytes32 public constant MAINNET_ALPHA_AGENT_ROOT_NODE =
        0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e;
    bytes32 public constant MAINNET_ALPHA_CLUB_ROOT_NODE =
        0x6487f659ec6f3fbd424b18b685728450d2559e4d68768393f9c689b2b6e5405e;
    bytes32 public constant MAINNET_NODE_ROOT_NODE =
        0xa26287e1184492446ad67d7dcdb51be050d4144ddda21bb3ba5926a8bf5c5731;
    bytes32 public constant MAINNET_ALPHA_NODE_ROOT_NODE =
        0x2d936bd2c82bc0aaa072a9d3c6d87aad1c1ec6a245f991129efb6ecc9fed57c4;

    constructor(
        IENS _ens,
        INameWrapper _nameWrapper,
        IReputationEngine _reputationEngine,
        bytes32 _agentRootNode,
        bytes32 _clubRootNode
    ) Ownable2Step(msg.sender) {
        ens = _ens;
        if (address(_ens) != address(0)) {
            emit ENSUpdated(address(_ens));
        }
        nameWrapper = _nameWrapper;
        if (address(_nameWrapper) != address(0)) {
            emit NameWrapperUpdated(address(_nameWrapper));
        }
        if (address(_reputationEngine) != address(0)) {
            if (_reputationEngine.version() != 2) {
                revert IncompatibleReputationEngine();
            }
            reputationEngine = _reputationEngine;
            emit ReputationEngineUpdated(address(_reputationEngine));
        }
        agentRootNode = _agentRootNode;
        if (_agentRootNode != bytes32(0)) {
            emit AgentRootNodeUpdated(_agentRootNode);
        }
        clubRootNode = _clubRootNode;
        if (_clubRootNode != bytes32(0)) {
            emit ClubRootNodeUpdated(_clubRootNode);
        }
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------

    function setENS(address ensAddr) public onlyOwner {
        _setENS(ensAddr);
    }

    function setNameWrapper(address wrapper) public onlyOwner {
        _setNameWrapper(wrapper);
    }

    function setReputationEngine(address engine) external onlyOwner {
        _setReputationEngine(engine);
    }

    function setAttestationRegistry(address registry) external onlyOwner {
        _setAttestationRegistry(registry);
    }

    function setAgentRootNode(bytes32 root) public onlyOwner {
        _setAgentRootNode(root);
    }

    function setClubRootNode(bytes32 root) public onlyOwner {
        _setClubRootNode(root);
    }

    function setNodeRootNode(bytes32 root) public onlyOwner {
        _setNodeRootNode(root);
    }

    function getAgentRootNodeAliases() external view returns (bytes32[] memory) {
        return agentRootNodeAliases;
    }

    function getClubRootNodeAliases() external view returns (bytes32[] memory) {
        return clubRootNodeAliases;
    }

    function getNodeRootNodeAliases() external view returns (bytes32[] memory) {
        return nodeRootNodeAliases;
    }

    function isAgentRootNodeAlias(bytes32 node) external view returns (bool) {
        return agentRootNodeAliasSet[node];
    }

    function isClubRootNodeAlias(bytes32 node) external view returns (bool) {
        return clubRootNodeAliasSet[node];
    }

    function isNodeRootNodeAlias(bytes32 node) external view returns (bool) {
        return nodeRootNodeAliasSet[node];
    }

    function addAgentRootNodeAlias(bytes32 node) external onlyOwner {
        _addAgentRootNodeAlias(node);
    }

    function removeAgentRootNodeAlias(bytes32 node) external onlyOwner {
        _removeAgentRootNodeAlias(node);
    }

    function addClubRootNodeAlias(bytes32 node) external onlyOwner {
        _addClubRootNodeAlias(node);
    }

    function removeClubRootNodeAlias(bytes32 node) external onlyOwner {
        _removeClubRootNodeAlias(node);
    }

    function addNodeRootNodeAlias(bytes32 node) external onlyOwner {
        _addNodeRootNodeAlias(node);
    }

    function removeNodeRootNodeAlias(bytes32 node) external onlyOwner {
        _removeNodeRootNodeAlias(node);
    }

    /// @notice Configure the registry with canonical mainnet ENS settings.
    function configureMainnet() external onlyOwner {
        _setENS(MAINNET_ENS);
        _setNameWrapper(MAINNET_NAME_WRAPPER);
        _setAgentRootNode(MAINNET_AGENT_ROOT_NODE);
        _setClubRootNode(MAINNET_CLUB_ROOT_NODE);
        _setNodeRootNode(MAINNET_NODE_ROOT_NODE);
        _addAgentRootNodeAlias(MAINNET_ALPHA_AGENT_ROOT_NODE);
        _addClubRootNodeAlias(MAINNET_ALPHA_CLUB_ROOT_NODE);
        _addNodeRootNodeAlias(MAINNET_ALPHA_NODE_ROOT_NODE);
        emit MainnetConfigured(
            MAINNET_ENS,
            MAINNET_NAME_WRAPPER,
            MAINNET_AGENT_ROOT_NODE,
            MAINNET_CLUB_ROOT_NODE,
            MAINNET_NODE_ROOT_NODE
        );
    }

    function setAgentMerkleRoot(bytes32 root) external onlyOwner {
        _setAgentMerkleRoot(root);
    }

    function setValidatorMerkleRoot(bytes32 root) external onlyOwner {
        _setValidatorMerkleRoot(root);
    }

    function addAdditionalAgent(address agent) external onlyOwner {
        _setAdditionalAgent(agent, true);
    }

    function removeAdditionalAgent(address agent) external onlyOwner {
        _setAdditionalAgent(agent, false);
    }

    function addAdditionalValidator(address validator) external onlyOwner {
        _setAdditionalValidator(validator, true);
    }

    function removeAdditionalValidator(address validator) external onlyOwner {
        _setAdditionalValidator(validator, false);
    }

    function addAdditionalNodeOperator(address nodeOperator) external onlyOwner {
        _setAdditionalNodeOperator(nodeOperator, true);
    }

    function removeAdditionalNodeOperator(address nodeOperator) external onlyOwner {
        _setAdditionalNodeOperator(nodeOperator, false);
    }

    function setAgentType(address agent, AgentType agentType) external onlyOwner {
        _setAgentType(agent, agentType);
    }

    function applyConfiguration(
        ConfigUpdate calldata config,
        AdditionalAgentConfig[] calldata agentUpdates,
        AdditionalValidatorConfig[] calldata validatorUpdates,
        AdditionalNodeOperatorConfig[] calldata nodeUpdates,
        RootNodeAliasConfig[] calldata agentRootAliasUpdates,
        RootNodeAliasConfig[] calldata clubRootAliasUpdates,
        RootNodeAliasConfig[] calldata nodeRootAliasUpdates,
        AgentTypeConfig[] calldata agentTypeUpdates
    ) external onlyOwner {
        bool ensUpdated;
        bool nameWrapperUpdated;
        bool reputationUpdated;
        bool attestationUpdated;
        bool agentRootUpdated;
        bool clubRootUpdated;
        bool nodeRootUpdated;
        bool agentMerkleUpdated;
        bool validatorMerkleUpdated;

        if (config.setENS) {
            _setENS(config.ens);
            ensUpdated = true;
        }

        if (config.setNameWrapper) {
            _setNameWrapper(config.nameWrapper);
            nameWrapperUpdated = true;
        }

        if (config.setReputationEngine) {
            _setReputationEngine(config.reputationEngine);
            reputationUpdated = true;
        }

        if (config.setAttestationRegistry) {
            _setAttestationRegistry(config.attestationRegistry);
            attestationUpdated = true;
        }

        if (config.setAgentRootNode) {
            _setAgentRootNode(config.agentRootNode);
            agentRootUpdated = true;
        }

        if (config.setClubRootNode) {
            _setClubRootNode(config.clubRootNode);
            clubRootUpdated = true;
        }

        if (config.setNodeRootNode) {
            _setNodeRootNode(config.nodeRootNode);
            nodeRootUpdated = true;
        }

        if (config.setAgentMerkleRoot) {
            _setAgentMerkleRoot(config.agentMerkleRoot);
            agentMerkleUpdated = true;
        }

        if (config.setValidatorMerkleRoot) {
            _setValidatorMerkleRoot(config.validatorMerkleRoot);
            validatorMerkleUpdated = true;
        }

        uint256 agentLen = agentUpdates.length;
        for (uint256 i; i < agentLen; i++) {
            AdditionalAgentConfig calldata update = agentUpdates[i];
            _setAdditionalAgent(update.agent, update.allowed);
        }

        uint256 validatorLen = validatorUpdates.length;
        for (uint256 i; i < validatorLen; i++) {
            AdditionalValidatorConfig calldata update = validatorUpdates[i];
            _setAdditionalValidator(update.validator, update.allowed);
        }

        uint256 nodeLen = nodeUpdates.length;
        for (uint256 i; i < nodeLen; i++) {
            AdditionalNodeOperatorConfig calldata nodeUpdate = nodeUpdates[i];
            _setAdditionalNodeOperator(nodeUpdate.nodeOperator, nodeUpdate.allowed);
        }

        uint256 agentAliasLen = agentRootAliasUpdates.length;
        for (uint256 i; i < agentAliasLen; i++) {
            RootNodeAliasConfig calldata update = agentRootAliasUpdates[i];
            if (update.allowed) {
                _addAgentRootNodeAlias(update.node);
            } else {
                _removeAgentRootNodeAlias(update.node);
            }
        }

        uint256 clubAliasLen = clubRootAliasUpdates.length;
        for (uint256 i; i < clubAliasLen; i++) {
            RootNodeAliasConfig calldata update = clubRootAliasUpdates[i];
            if (update.allowed) {
                _addClubRootNodeAlias(update.node);
            } else {
                _removeClubRootNodeAlias(update.node);
            }
        }

        uint256 nodeAliasLen = nodeRootAliasUpdates.length;
        for (uint256 i; i < nodeAliasLen; i++) {
            RootNodeAliasConfig calldata update = nodeRootAliasUpdates[i];
            if (update.allowed) {
                _addNodeRootNodeAlias(update.node);
            } else {
                _removeNodeRootNodeAlias(update.node);
            }
        }

        uint256 agentTypeLen = agentTypeUpdates.length;
        for (uint256 i; i < agentTypeLen; i++) {
            AgentTypeConfig calldata update = agentTypeUpdates[i];
            _setAgentType(update.agent, update.agentType);
        }

        emit ConfigurationApplied(
            msg.sender,
            ensUpdated,
            nameWrapperUpdated,
            reputationUpdated,
            attestationUpdated,
            agentRootUpdated,
            clubRootUpdated,
            nodeRootUpdated,
            agentMerkleUpdated,
            validatorMerkleUpdated,
            agentLen,
            validatorLen,
            nodeLen,
            agentTypeLen
        );
    }

    function _setENS(address ensAddr) internal {
        if (ensAddr == address(0)) {
            revert ZeroAddress();
        }
        ens = IENS(ensAddr);
        emit ENSUpdated(ensAddr);
    }

    function _setNameWrapper(address wrapper) internal {
        if (wrapper == address(0)) {
            revert ZeroAddress();
        }
        nameWrapper = INameWrapper(wrapper);
        emit NameWrapperUpdated(wrapper);
    }

    function _setReputationEngine(address engine) internal {
        if (engine == address(0)) {
            revert ZeroAddress();
        }
        if (IReputationEngine(engine).version() != 2) {
            revert IncompatibleReputationEngine();
        }
        reputationEngine = IReputationEngine(engine);
        emit ReputationEngineUpdated(engine);
    }

    function _setAttestationRegistry(address registry) internal {
        if (registry == address(0)) {
            revert ZeroAddress();
        }
        attestationRegistry = AttestationRegistry(registry);
        emit AttestationRegistryUpdated(registry);
    }

    function _setAgentRootNode(bytes32 root) internal {
        agentRootNode = root;
        emit AgentRootNodeUpdated(root);
    }

    function _setClubRootNode(bytes32 root) internal {
        clubRootNode = root;
        emit ClubRootNodeUpdated(root);
    }

    function _setNodeRootNode(bytes32 root) internal {
        nodeRootNode = root;
        emit NodeRootNodeUpdated(root);
    }

    function _setAgentMerkleRoot(bytes32 root) internal {
        agentMerkleRoot = root;
        emit AgentMerkleRootUpdated(root);
    }

    function _setValidatorMerkleRoot(bytes32 root) internal {
        validatorMerkleRoot = root;
        emit ValidatorMerkleRootUpdated(root);
    }

    function _setAdditionalAgent(address agent, bool allowed) internal {
        if (allowed && agent == address(0)) {
            revert ZeroAddress();
        }
        additionalAgents[agent] = allowed;
        emit AdditionalAgentUpdated(agent, allowed);
    }

    function _setAdditionalValidator(address validator, bool allowed) internal {
        if (allowed && validator == address(0)) {
            revert ZeroAddress();
        }
        additionalValidators[validator] = allowed;
        emit AdditionalValidatorUpdated(validator, allowed);
    }

    function _setAdditionalNodeOperator(address nodeOperator, bool allowed) internal {
        if (allowed && nodeOperator == address(0)) {
            revert ZeroAddress();
        }
        additionalNodeOperators[nodeOperator] = allowed;
        emit AdditionalNodeOperatorUpdated(nodeOperator, allowed);
    }

    function _addAgentRootNodeAlias(bytes32 node) internal {
        if (node == bytes32(0)) {
            revert ZeroNode();
        }
        if (agentRootNodeAliasSet[node] || node == agentRootNode) {
            return;
        }
        agentRootNodeAliasSet[node] = true;
        agentRootNodeAliases.push(node);
        emit AgentRootNodeAliasUpdated(node, true);
    }

    function _removeAgentRootNodeAlias(bytes32 node) internal {
        if (node == bytes32(0)) {
            revert ZeroNode();
        }
        if (!agentRootNodeAliasSet[node]) {
            return;
        }
        agentRootNodeAliasSet[node] = false;
        uint256 len = agentRootNodeAliases.length;
        for (uint256 i; i < len; i++) {
            if (agentRootNodeAliases[i] == node) {
                if (i != len - 1) {
                    agentRootNodeAliases[i] = agentRootNodeAliases[len - 1];
                }
                agentRootNodeAliases.pop();
                break;
            }
        }
        emit AgentRootNodeAliasUpdated(node, false);
    }

    function _addClubRootNodeAlias(bytes32 node) internal {
        if (node == bytes32(0)) {
            revert ZeroNode();
        }
        if (clubRootNodeAliasSet[node] || node == clubRootNode) {
            return;
        }
        clubRootNodeAliasSet[node] = true;
        clubRootNodeAliases.push(node);
        emit ClubRootNodeAliasUpdated(node, true);
    }

    function _removeClubRootNodeAlias(bytes32 node) internal {
        if (node == bytes32(0)) {
            revert ZeroNode();
        }
        if (!clubRootNodeAliasSet[node]) {
            return;
        }
        clubRootNodeAliasSet[node] = false;
        uint256 len = clubRootNodeAliases.length;
        for (uint256 i; i < len; i++) {
            if (clubRootNodeAliases[i] == node) {
                if (i != len - 1) {
                    clubRootNodeAliases[i] = clubRootNodeAliases[len - 1];
                }
                clubRootNodeAliases.pop();
                break;
            }
        }
        emit ClubRootNodeAliasUpdated(node, false);
    }

    function _addNodeRootNodeAlias(bytes32 node) internal {
        if (node == bytes32(0)) {
            revert ZeroNode();
        }
        if (nodeRootNodeAliasSet[node] || node == nodeRootNode) {
            return;
        }
        nodeRootNodeAliasSet[node] = true;
        nodeRootNodeAliases.push(node);
        emit NodeRootNodeAliasUpdated(node, true);
    }

    function _removeNodeRootNodeAlias(bytes32 node) internal {
        if (node == bytes32(0)) {
            revert ZeroNode();
        }
        if (!nodeRootNodeAliasSet[node]) {
            return;
        }
        nodeRootNodeAliasSet[node] = false;
        uint256 len = nodeRootNodeAliases.length;
        for (uint256 i; i < len; i++) {
            if (nodeRootNodeAliases[i] == node) {
                if (i != len - 1) {
                    nodeRootNodeAliases[i] = nodeRootNodeAliases[len - 1];
                }
                nodeRootNodeAliases.pop();
                break;
            }
        }
        emit NodeRootNodeAliasUpdated(node, false);
    }

    function _setAgentType(address agent, AgentType agentType) internal {
        if (agent == address(0)) {
            revert ZeroAddress();
        }
        agentTypes[agent] = agentType;
        emit AgentTypeUpdated(agent, agentType);
    }

    function getAgentType(address agent) external view returns (AgentType) {
        return agentTypes[agent];
    }

    // ---------------------------------------------------------------------
    // Agent profile metadata
    // ---------------------------------------------------------------------

    /// @notice Set or overwrite an agent's capability metadata URI.
    /// @dev Restricted to governance/owner.
    function setAgentProfileURI(address agent, string calldata uri) external onlyOwner {
        if (agent == address(0)) {
            revert ZeroAddress();
        }
        agentProfileURI[agent] = uri;
        emit AgentProfileUpdated(agent, uri);
    }

    /// @notice Allows an agent to update their own profile after proving identity.
    /// @param subdomain ENS subdomain owned by the agent.
    /// @param proof Merkle/ENS proof demonstrating control of the subdomain.
    /// @param uri Metadata URI describing the agent's capabilities.
    function updateAgentProfile(
        string calldata subdomain,
        bytes32[] calldata proof,
        string calldata uri
    ) external {
        (bool ok, , , ) = _verifyAgent(msg.sender, subdomain, proof);
        if (!ok) {
            revert UnauthorizedAgent();
        }
        agentProfileURI[msg.sender] = uri;
        emit AgentProfileUpdated(msg.sender, uri);
    }

    // ---------------------------------------------------------------------
    // Authorization helpers
    // ---------------------------------------------------------------------

    function _checkAgentENSOwnership(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) internal view returns (bool ok) {
        _assertSubdomain(subdomain);
        if (agentRootNode != bytes32(0)) {
            (ok, , , ) = ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                agentRootNode,
                agentMerkleRoot,
                claimant,
                subdomain,
                proof
            );
            if (ok) {
                return true;
            }
        }

        uint256 aliasLen = agentRootNodeAliases.length;
        for (uint256 i; i < aliasLen; i++) {
            (ok, , , ) = ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                agentRootNodeAliases[i],
                agentMerkleRoot,
                claimant,
                subdomain,
                proof
            );
            if (ok) {
                return true;
            }
        }

        return false;
    }

    function _checkValidatorENSOwnership(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) internal view returns (bool ok) {
        _assertSubdomain(subdomain);
        if (clubRootNode != bytes32(0)) {
            (ok, , , ) = ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                clubRootNode,
                validatorMerkleRoot,
                claimant,
                subdomain,
                proof
            );
            if (ok) {
                return true;
            }
        }

        uint256 aliasLen = clubRootNodeAliases.length;
        for (uint256 i; i < aliasLen; i++) {
            (ok, , , ) = ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                clubRootNodeAliases[i],
                validatorMerkleRoot,
                claimant,
                subdomain,
                proof
            );
            if (ok) {
                return true;
            }
        }

        return false;
    }

    function _checkNodeENSOwnership(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) internal view returns (bool ok) {
        _assertSubdomain(subdomain);
        if (nodeRootNode != bytes32(0)) {
            (ok, , , ) = ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                nodeRootNode,
                validatorMerkleRoot,
                claimant,
                subdomain,
                proof
            );
            if (ok) {
                return true;
            }
        }

        uint256 aliasLen = nodeRootNodeAliases.length;
        for (uint256 i; i < aliasLen; i++) {
            (ok, , , ) = ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                nodeRootNodeAliases[i],
                validatorMerkleRoot,
                claimant,
                subdomain,
                proof
            );
            if (ok) {
                return true;
            }
        }

        return false;
    }

    function _deriveNodeFromLabel(bytes32 root, bytes32[] storage aliases, bytes32 label)
        internal
        view
        returns (bytes32)
    {
        if (root != bytes32(0)) {
            return keccak256(abi.encodePacked(root, label));
        }
        if (aliases.length != 0) {
            return keccak256(abi.encodePacked(aliases[0], label));
        }
        return bytes32(0);
    }

    function _verifyOwnership(
        bytes32 root,
        bytes32[] storage aliases,
        bytes32 merkleRoot,
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) private returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle) {
        _assertSubdomain(subdomain);
        if (root != bytes32(0)) {
            (ok, node, viaWrapper, viaMerkle) = ENSIdentityVerifier.verifyOwnership(
                ens,
                nameWrapper,
                root,
                merkleRoot,
                claimant,
                subdomain,
                proof
            );
            if (ok) {
                return (true, node, viaWrapper, viaMerkle);
            }
        }

        uint256 aliasLen = aliases.length;
        for (uint256 i; i < aliasLen; i++) {
            (ok, node, viaWrapper, viaMerkle) = ENSIdentityVerifier.verifyOwnership(
                ens,
                nameWrapper,
                aliases[i],
                merkleRoot,
                claimant,
                subdomain,
                proof
            );
            if (ok) {
                return (true, node, viaWrapper, viaMerkle);
            }
        }

        bytes32 labelHash = keccak256(bytes(subdomain));
        node = _deriveNodeFromLabel(root, aliases, labelHash);
        return (false, node, false, false);
    }

    function _verifyAgentENSOwnership(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) internal returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle) {
        return _verifyOwnership(
            agentRootNode,
            agentRootNodeAliases,
            agentMerkleRoot,
            claimant,
            subdomain,
            proof
        );
    }

    function _verifyValidatorENSOwnership(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) internal returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle) {
        return _verifyOwnership(
            clubRootNode,
            clubRootNodeAliases,
            validatorMerkleRoot,
            claimant,
            subdomain,
            proof
        );
    }

    function _verifyNodeENSOwnership(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) internal returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle) {
        return _verifyOwnership(
            nodeRootNode,
            nodeRootNodeAliases,
            validatorMerkleRoot,
            claimant,
            subdomain,
            proof
        );
    }

    function isAuthorizedAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public view returns (bool) {
        _assertSubdomain(subdomain);
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalAgents[claimant]) {
            return true;
        }
        if (address(attestationRegistry) != address(0)) {
            bytes32 labelHash = keccak256(bytes(subdomain));
            if (agentRootNode != bytes32(0)) {
                bytes32 node = keccak256(
                    abi.encodePacked(agentRootNode, labelHash)
                );
                if (
                    attestationRegistry.isAttested(
                        node,
                        AttestationRegistry.Role.Agent,
                        claimant
                    )
                ) {
                    return true;
                }
            }
            uint256 aliasLen = agentRootNodeAliases.length;
            for (uint256 i; i < aliasLen; i++) {
                bytes32 aliasNode = keccak256(
                    abi.encodePacked(agentRootNodeAliases[i], labelHash)
                );
                if (
                    attestationRegistry.isAttested(
                        aliasNode,
                        AttestationRegistry.Role.Agent,
                        claimant
                    )
                ) {
                    return true;
                }
            }
        }
        return _checkAgentENSOwnership(claimant, subdomain, proof);
    }

    function isAuthorizedValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public view returns (bool) {
        _assertSubdomain(subdomain);
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalValidators[claimant]) {
            return true;
        }
        if (additionalNodeOperators[claimant]) {
            return true;
        }
        if (address(attestationRegistry) != address(0)) {
            bytes32 labelHash = keccak256(bytes(subdomain));
            if (clubRootNode != bytes32(0)) {
                bytes32 node = keccak256(
                    abi.encodePacked(clubRootNode, labelHash)
                );
                if (
                    attestationRegistry.isAttested(
                        node,
                        AttestationRegistry.Role.Validator,
                        claimant
                    )
                ) {
                    return true;
                }
            }
            uint256 aliasLen = clubRootNodeAliases.length;
            for (uint256 i; i < aliasLen; i++) {
                bytes32 aliasNode = keccak256(
                    abi.encodePacked(clubRootNodeAliases[i], labelHash)
                );
                if (
                    attestationRegistry.isAttested(
                        aliasNode,
                        AttestationRegistry.Role.Validator,
                        claimant
                    )
                ) {
                    return true;
                }
            }
            if (nodeRootNode != bytes32(0)) {
                bytes32 node = keccak256(
                    abi.encodePacked(nodeRootNode, labelHash)
                );
                if (
                    attestationRegistry.isAttested(
                        node,
                        AttestationRegistry.Role.Node,
                        claimant
                    )
                ) {
                    return true;
                }
            }
            uint256 nodeAliasLen = nodeRootNodeAliases.length;
            for (uint256 i; i < nodeAliasLen; i++) {
                bytes32 aliasNode = keccak256(
                    abi.encodePacked(nodeRootNodeAliases[i], labelHash)
                );
                if (
                    attestationRegistry.isAttested(
                        aliasNode,
                        AttestationRegistry.Role.Node,
                        claimant
                    )
                ) {
                    return true;
                }
            }
        }
        if (_checkValidatorENSOwnership(claimant, subdomain, proof)) {
            return true;
        }
        return _checkNodeENSOwnership(claimant, subdomain, proof);
    }

    function _verifyAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        internal
        returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle)
    {
        _assertSubdomain(subdomain);
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return (false, bytes32(0), false, false);
        }
        bytes32 labelHash = keccak256(bytes(subdomain));
        if (agentRootNode != bytes32(0)) {
            node = keccak256(abi.encodePacked(agentRootNode, labelHash));
        }
        if (additionalAgents[claimant]) {
            ok = true;
        } else if (address(attestationRegistry) != address(0)) {
            if (
                node != bytes32(0) &&
                attestationRegistry.isAttested(
                    node,
                    AttestationRegistry.Role.Agent,
                    claimant
                )
            ) {
                ok = true;
            } else {
                uint256 aliasLen = agentRootNodeAliases.length;
                for (uint256 i; i < aliasLen; i++) {
                    bytes32 aliasRoot = agentRootNodeAliases[i];
                    bytes32 aliasNode = keccak256(
                        abi.encodePacked(aliasRoot, labelHash)
                    );
                    if (
                        attestationRegistry.isAttested(
                            aliasNode,
                            AttestationRegistry.Role.Agent,
                            claimant
                        )
                    ) {
                        node = aliasNode;
                        ok = true;
                        break;
                    }
                }
            }
        }
        if (!ok) {
            (ok, node, viaWrapper, viaMerkle) =
                _verifyAgentENSOwnership(claimant, subdomain, proof);
        }
    }

    function verifyAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        external
        returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle)
    {
        (ok, node, viaWrapper, viaMerkle) =
            _verifyAgent(claimant, subdomain, proof);
        if (ok) {
            if (additionalAgents[claimant]) {
                emit AdditionalAgentUsed(claimant, subdomain);
                emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
            } else if (
                address(attestationRegistry) != address(0) &&
                attestationRegistry.isAttested(
                    node,
                    AttestationRegistry.Role.Agent,
                    claimant
                )
            ) {
                emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
            }
            emit IdentityVerified(
                claimant,
                AttestationRegistry.Role.Agent,
                node,
                subdomain
            );
            emit ENSVerified(claimant, node, subdomain, viaWrapper, viaMerkle);
        } else {
            emit IdentityVerificationFailed(
                claimant,
                AttestationRegistry.Role.Agent,
                subdomain
            );
        }
    }

    function _verifyNode(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) internal returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle) {
        _assertSubdomain(subdomain);
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return (false, bytes32(0), false, false);
        }

        bytes32 labelHash = keccak256(bytes(subdomain));
        bytes32 derivedNode = _deriveNodeFromLabel(
            nodeRootNode,
            nodeRootNodeAliases,
            labelHash
        );

        if (additionalNodeOperators[claimant]) {
            emit AdditionalNodeOperatorUsed(claimant, subdomain);
            emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
            return (true, derivedNode, false, false);
        }

        if (address(attestationRegistry) != address(0)) {
            if (
                derivedNode != bytes32(0) &&
                attestationRegistry.isAttested(
                    derivedNode,
                    AttestationRegistry.Role.Node,
                    claimant
                )
            ) {
                emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
                return (true, derivedNode, false, false);
            }

            uint256 aliasLen = nodeRootNodeAliases.length;
            for (uint256 i; i < aliasLen; i++) {
                bytes32 aliasRoot = nodeRootNodeAliases[i];
                bytes32 aliasNode = keccak256(
                    abi.encodePacked(aliasRoot, labelHash)
                );
                if (
                    attestationRegistry.isAttested(
                        aliasNode,
                        AttestationRegistry.Role.Node,
                        claimant
                    )
                ) {
                    emit ENSIdentityVerifier.OwnershipVerified(
                        claimant,
                        subdomain
                    );
                    return (true, aliasNode, false, false);
                }
            }
        }

        (ok, node, viaWrapper, viaMerkle) = _verifyNodeENSOwnership(
            claimant,
            subdomain,
            proof
        );
        if (ok) {
            emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
        }

        return (ok, node, viaWrapper, viaMerkle);
    }

    function verifyValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        external
        returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle)
    {
        _assertSubdomain(subdomain);
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return (false, bytes32(0), false, false);
        }
        bytes32 labelHash = keccak256(bytes(subdomain));
        bytes32 validatorNode = _deriveNodeFromLabel(
            clubRootNode,
            clubRootNodeAliases,
            labelHash
        );
        node = validatorNode;
        if (additionalValidators[claimant]) {
            emit AdditionalValidatorUsed(claimant, subdomain);
            emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
            ok = true;
        } else if (address(attestationRegistry) != address(0)) {
            if (
                validatorNode != bytes32(0) &&
                attestationRegistry.isAttested(
                    validatorNode,
                    AttestationRegistry.Role.Validator,
                    claimant
                )
            ) {
                emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
                node = validatorNode;
                ok = true;
            } else {
                uint256 aliasLen = clubRootNodeAliases.length;
                for (uint256 i; i < aliasLen; i++) {
                    bytes32 aliasRoot = clubRootNodeAliases[i];
                    bytes32 aliasNode = keccak256(
                        abi.encodePacked(aliasRoot, labelHash)
                    );
                    if (
                        attestationRegistry.isAttested(
                            aliasNode,
                            AttestationRegistry.Role.Validator,
                            claimant
                        )
                    ) {
                        emit ENSIdentityVerifier.OwnershipVerified(
                            claimant,
                            subdomain
                        );
                        node = aliasNode;
                        ok = true;
                        break;
                    }
                }
            }
        }
        if (!ok) {
            (ok, node, viaWrapper, viaMerkle) = _verifyValidatorENSOwnership(
                claimant,
                subdomain,
                proof
            );
            if (!ok) {
                (ok, node, viaWrapper, viaMerkle) = _verifyNode(
                    claimant,
                    subdomain,
                    proof
                );
            }
        }
        if (ok) {
            emit IdentityVerified(
                claimant,
                AttestationRegistry.Role.Validator,
                node,
                subdomain
            );
            emit ENSVerified(claimant, node, subdomain, viaWrapper, viaMerkle);
        } else {
            emit IdentityVerificationFailed(
                claimant,
                AttestationRegistry.Role.Validator,
                subdomain
            );
        }
    }

    function verifyNode(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        external
        returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle)
    {
        (ok, node, viaWrapper, viaMerkle) = _verifyNode(claimant, subdomain, proof);
        if (ok) {
            emit IdentityVerified(
                claimant,
                AttestationRegistry.Role.Node,
                node,
                subdomain
            );
            emit ENSVerified(claimant, node, subdomain, viaWrapper, viaMerkle);
        } else {
            emit IdentityVerificationFailed(
                claimant,
                AttestationRegistry.Role.Node,
                subdomain
            );
        }
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    /// @return Always true, signalling perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert EtherNotAccepted();
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert EtherNotAccepted();
    }
}

