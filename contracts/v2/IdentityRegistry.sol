// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

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
        if (ensAddr == address(0)) {
            revert ZeroAddress();
        }
        ens = IENS(ensAddr);
        emit ENSUpdated(ensAddr);
    }

    function setNameWrapper(address wrapper) public onlyOwner {
        if (wrapper == address(0)) {
            revert ZeroAddress();
        }
        nameWrapper = INameWrapper(wrapper);
        emit NameWrapperUpdated(wrapper);
    }

    function setReputationEngine(address engine) external onlyOwner {
        if (engine == address(0)) {
            revert ZeroAddress();
        }
        if (IReputationEngine(engine).version() != 2) {
            revert IncompatibleReputationEngine();
        }
        reputationEngine = IReputationEngine(engine);
        emit ReputationEngineUpdated(engine);
    }

    function setAttestationRegistry(address registry) external onlyOwner {
        if (registry == address(0)) {
            revert ZeroAddress();
        }
        attestationRegistry = AttestationRegistry(registry);
        emit AttestationRegistryUpdated(registry);
    }

    function setAgentRootNode(bytes32 root) public onlyOwner {
        agentRootNode = root;
        emit AgentRootNodeUpdated(root);
    }

    function setClubRootNode(bytes32 root) public onlyOwner {
        clubRootNode = root;
        emit ClubRootNodeUpdated(root);
    }

    /// @notice Configure the registry with canonical mainnet ENS settings.
    function configureMainnet() external onlyOwner {
        setENS(MAINNET_ENS);
        setNameWrapper(MAINNET_NAME_WRAPPER);
        setAgentRootNode(MAINNET_AGENT_ROOT_NODE);
        setClubRootNode(MAINNET_CLUB_ROOT_NODE);
        emit MainnetConfigured(
            MAINNET_ENS,
            MAINNET_NAME_WRAPPER,
            MAINNET_AGENT_ROOT_NODE,
            MAINNET_CLUB_ROOT_NODE
        );
    }

    function setAgentMerkleRoot(bytes32 root) external onlyOwner {
        agentMerkleRoot = root;
        emit AgentMerkleRootUpdated(root);
    }

    function setValidatorMerkleRoot(bytes32 root) external onlyOwner {
        validatorMerkleRoot = root;
        emit ValidatorMerkleRootUpdated(root);
    }

    function addAdditionalAgent(address agent) external onlyOwner {
        if (agent == address(0)) {
            revert ZeroAddress();
        }
        additionalAgents[agent] = true;
        emit AdditionalAgentUpdated(agent, true);
    }

    function removeAdditionalAgent(address agent) external onlyOwner {
        additionalAgents[agent] = false;
        emit AdditionalAgentUpdated(agent, false);
    }

    function addAdditionalValidator(address validator) external onlyOwner {
        if (validator == address(0)) {
            revert ZeroAddress();
        }
        additionalValidators[validator] = true;
        emit AdditionalValidatorUpdated(validator, true);
    }

    function removeAdditionalValidator(address validator) external onlyOwner {
        additionalValidators[validator] = false;
        emit AdditionalValidatorUpdated(validator, false);
    }

    function setAgentType(address agent, AgentType agentType) external onlyOwner {
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

