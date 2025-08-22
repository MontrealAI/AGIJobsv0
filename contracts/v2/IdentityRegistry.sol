// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IENS} from "./interfaces/IENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {ENSIdentityVerifier} from "./ENSIdentityVerifier.sol";

/// @title IdentityRegistry
/// @notice Verifies ENS subdomain ownership and tracks manual allowlists
/// for agents and validators. Provides helper views that also check
/// reputation blacklists.
contract IdentityRegistry is Ownable {
    IENS public ens;
    INameWrapper public nameWrapper;
    IReputationEngine public reputationEngine;

    bytes32 public agentRootNode;
    bytes32 public clubRootNode;
    bytes32 public agentMerkleRoot;
    bytes32 public validatorMerkleRoot;

    mapping(address => bool) public additionalAgents;
    mapping(address => bool) public additionalValidators;

    event ENSUpdated(address indexed ens);
    event NameWrapperUpdated(address indexed nameWrapper);
    event ReputationEngineUpdated(address indexed reputationEngine);
    event AgentRootNodeUpdated(bytes32 indexed agentRootNode);
    event ClubRootNodeUpdated(bytes32 indexed clubRootNode);
    event AgentMerkleRootUpdated(bytes32 indexed agentMerkleRoot);
    event ValidatorMerkleRootUpdated(bytes32 indexed validatorMerkleRoot);
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    event AdditionalValidatorUpdated(address indexed validator, bool allowed);

    constructor(
        IENS _ens,
        INameWrapper _nameWrapper,
        IReputationEngine _reputationEngine,
        bytes32 _agentRootNode,
        bytes32 _clubRootNode
    ) Ownable(msg.sender) {
        ens = _ens;
        if (address(_ens) != address(0)) {
            emit ENSUpdated(address(_ens));
        }
        nameWrapper = _nameWrapper;
        if (address(_nameWrapper) != address(0)) {
            emit NameWrapperUpdated(address(_nameWrapper));
        }
        reputationEngine = _reputationEngine;
        if (address(_reputationEngine) != address(0)) {
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

    function setENS(address ensAddr) external onlyOwner {
        ens = IENS(ensAddr);
        emit ENSUpdated(ensAddr);
    }

    function setNameWrapper(address wrapper) external onlyOwner {
        nameWrapper = INameWrapper(wrapper);
        emit NameWrapperUpdated(wrapper);
    }

    function setReputationEngine(address engine) external onlyOwner {
        reputationEngine = IReputationEngine(engine);
        emit ReputationEngineUpdated(engine);
    }

    function setAgentRootNode(bytes32 root) external onlyOwner {
        agentRootNode = root;
        emit AgentRootNodeUpdated(root);
    }

    function setClubRootNode(bytes32 root) external onlyOwner {
        clubRootNode = root;
        emit ClubRootNodeUpdated(root);
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
        require(agent != address(0), "agent");
        additionalAgents[agent] = true;
        emit AdditionalAgentUpdated(agent, true);
    }

    function removeAdditionalAgent(address agent) external onlyOwner {
        additionalAgents[agent] = false;
        emit AdditionalAgentUpdated(agent, false);
    }

    function addAdditionalValidator(address validator) external onlyOwner {
        require(validator != address(0), "validator");
        additionalValidators[validator] = true;
        emit AdditionalValidatorUpdated(validator, true);
    }

    function removeAdditionalValidator(address validator) external onlyOwner {
        additionalValidators[validator] = false;
        emit AdditionalValidatorUpdated(validator, false);
    }

    // ---------------------------------------------------------------------
    // Authorization helpers
    // ---------------------------------------------------------------------

    function isAuthorizedAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external view returns (bool) {
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalAgents[claimant]) {
            return true;
        }
        return
            ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                agentRootNode,
                agentMerkleRoot,
                claimant,
                subdomain,
                proof
            );
    }

    function isAuthorizedValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external view returns (bool) {
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalValidators[claimant]) {
            return true;
        }
        return
            ENSIdentityVerifier.checkOwnership(
                ens,
                nameWrapper,
                clubRootNode,
                validatorMerkleRoot,
                claimant,
                subdomain,
                proof
            );
    }

    function verifyAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool) {
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalAgents[claimant]) {
            emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
            return true;
        }
        return
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

    function verifyValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool) {
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(claimant)
        ) {
            return false;
        }
        if (additionalValidators[claimant]) {
            emit ENSIdentityVerifier.OwnershipVerified(claimant, subdomain);
            return true;
        }
        return
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
}

