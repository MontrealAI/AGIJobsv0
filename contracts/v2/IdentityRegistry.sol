// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable2Step} from "./utils/Ownable2Step.sol";
import {IENS} from "./interfaces/IENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {ENSIdentityVerifier} from "./ENSIdentityVerifier.sol";
import {AttestationRegistry} from "./AttestationRegistry.sol";

error ZeroAddress();
error UnauthorizedAgent();
error EtherNotAccepted();
error IncompatibleReputationEngine();

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
    bytes32 public agentMerkleRoot;
    bytes32 public validatorMerkleRoot;

    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;
    mapping(address => AgentType) public agentTypes;
    /// @notice Optional metadata URI describing agent capabilities.
    mapping(address => string) public agentProfileURI;

    event ENSUpdated(address indexed ens);
    event NameWrapperUpdated(address indexed nameWrapper);
    event ReputationEngineUpdated(address indexed reputationEngine);
    event AttestationRegistryUpdated(address indexed attestationRegistry);
    event AgentRootNodeUpdated(bytes32 indexed agentRootNode);
    event ClubRootNodeUpdated(bytes32 indexed clubRootNode);
    event AgentMerkleRootUpdated(bytes32 indexed agentMerkleRoot);
    event ValidatorMerkleRootUpdated(bytes32 indexed validatorMerkleRoot);
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    event AdditionalValidatorUpdated(address indexed validator, bool allowed);
    event AdditionalAgentUsed(address indexed agent, string subdomain);
    event AdditionalValidatorUsed(address indexed validator, string subdomain);
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
        bytes32 clubRoot
    );

    event ConfigurationApplied(
        address indexed caller,
        bool ensUpdated,
        bool nameWrapperUpdated,
        bool reputationEngineUpdated,
        bool attestationRegistryUpdated,
        bool agentRootUpdated,
        bool clubRootUpdated,
        bool agentMerkleRootUpdated,
        bool validatorMerkleRootUpdated,
        uint256 additionalAgentUpdates,
        uint256 additionalValidatorUpdates,
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
        bool setAgentMerkleRoot;
        bytes32 agentMerkleRoot;
        bool setValidatorMerkleRoot;
        bytes32 validatorMerkleRoot;
    }

    struct AdditionalAgentConfig {
        address agent;
        bool allowed;
    }

    struct AdditionalValidatorConfig {
        address validator;
        bool allowed;
    }

    struct AgentTypeConfig {
        address agent;
        AgentType agentType;
    }

    address public constant MAINNET_ENS =
        0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;
    address public constant MAINNET_NAME_WRAPPER =
        0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401;
    bytes32 public constant MAINNET_AGENT_ROOT_NODE =
        0x2c9c6189b2e92da4d0407e9deb38ff6870729ad063af7e8576cb7b7898c88e2d;
    bytes32 public constant MAINNET_CLUB_ROOT_NODE =
        0x39eb848f88bdfb0a6371096249dd451f56859dfe2cd3ddeab1e26d5bb68ede16;

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

    /// @notice Configure the registry with canonical mainnet ENS settings.
    function configureMainnet() external onlyOwner {
        _setENS(MAINNET_ENS);
        _setNameWrapper(MAINNET_NAME_WRAPPER);
        _setAgentRootNode(MAINNET_AGENT_ROOT_NODE);
        _setClubRootNode(MAINNET_CLUB_ROOT_NODE);
        emit MainnetConfigured(
            MAINNET_ENS,
            MAINNET_NAME_WRAPPER,
            MAINNET_AGENT_ROOT_NODE,
            MAINNET_CLUB_ROOT_NODE
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

    function setAgentType(address agent, AgentType agentType) external onlyOwner {
        _setAgentType(agent, agentType);
    }

    function applyConfiguration(
        ConfigUpdate calldata config,
        AdditionalAgentConfig[] calldata agentUpdates,
        AdditionalValidatorConfig[] calldata validatorUpdates,
        AgentTypeConfig[] calldata agentTypeUpdates
    ) external onlyOwner {
        bool ensUpdated;
        bool nameWrapperUpdated;
        bool reputationUpdated;
        bool attestationUpdated;
        bool agentRootUpdated;
        bool clubRootUpdated;
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
            agentMerkleUpdated,
            validatorMerkleUpdated,
            agentLen,
            validatorLen,
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

    function isAuthorizedAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public view returns (bool) {
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
            bytes32 node = keccak256(
                abi.encodePacked(agentRootNode, keccak256(bytes(subdomain)))
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
        (bool ok, , , ) =
            ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                agentRootNode,
                agentMerkleRoot,
                claimant,
                subdomain,
                proof
            );
        return ok;
    }

    function isAuthorizedValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public view returns (bool) {
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalValidators[claimant]) {
            return true;
        }
        if (address(attestationRegistry) != address(0)) {
            bytes32 node = keccak256(
                abi.encodePacked(clubRootNode, keccak256(bytes(subdomain)))
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
        (bool ok, , , ) =
            ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                clubRootNode,
                validatorMerkleRoot,
                claimant,
                subdomain,
                proof
            );
        return ok;
    }

    function _verifyAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        internal
        returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle)
    {
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return (false, bytes32(0), false, false);
        }
        node =
            keccak256(abi.encodePacked(agentRootNode, keccak256(bytes(subdomain))));
        if (additionalAgents[claimant]) {
            ok = true;
        } else if (address(attestationRegistry) != address(0) && attestationRegistry.isAttested(
                node,
                AttestationRegistry.Role.Agent,
                claimant
            )) {
            ok = true;
        } else {
            (ok, node, viaWrapper, viaMerkle) =
                ENSIdentityVerifier.verifyOwnership(
                    ens,
                    nameWrapper,
                    agentRootNode,
                    agentMerkleRoot,
                    claimant,
                    subdomain,
                    proof
                );
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

    function verifyValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        external
        returns (bool ok, bytes32 node, bool viaWrapper, bool viaMerkle)
    {
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return (false, bytes32(0), false, false);
        }
        node =
            keccak256(abi.encodePacked(clubRootNode, keccak256(bytes(subdomain))));
        if (additionalValidators[claimant]) {
            emit AdditionalValidatorUsed(claimant, subdomain);
            emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
            ok = true;
        } else if (address(attestationRegistry) != address(0) && attestationRegistry.isAttested(
                node,
                AttestationRegistry.Role.Validator,
                claimant
            )) {
            emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
            ok = true;
        } else {
            (ok, node, viaWrapper, viaMerkle) =
                ENSIdentityVerifier.verifyOwnership(
                    ens,
                    nameWrapper,
                    clubRootNode,
                    validatorMerkleRoot,
                    claimant,
                    subdomain,
                    proof
                );
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

