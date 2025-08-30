// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IENS} from "../interfaces/IENS.sol";
import {INameWrapper} from "../interfaces/INameWrapper.sol";
import {VerifyOwnership} from "./VerifyOwnership.sol";

/// @title ENSOwnershipVerifier
/// @notice Verifies ownership of ENS subdomains via Merkle proofs or on-chain lookups
contract ENSOwnershipVerifier is Ownable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    IENS public ens;
    INameWrapper public nameWrapper;

    bytes32 public clubRootNode;
    bytes32 public agentRootNode;
    bytes32 public validatorMerkleRoot;
    bytes32 public agentMerkleRoot;

    event OwnershipVerified(address indexed claimant, string subdomain);
    event RecoveryInitiated(string reason);
    event ENSUpdated(address indexed ens);
    event NameWrapperUpdated(address indexed nameWrapper);
    // legacy granular events retained for backward compatibility
    event ClubRootNodeUpdated(bytes32 indexed clubRootNode);
    event AgentRootNodeUpdated(bytes32 indexed agentRootNode);
    event ValidatorMerkleRootUpdated(bytes32 indexed validatorMerkleRoot);
    event AgentMerkleRootUpdated(bytes32 indexed agentMerkleRoot);
    // generic update events
    event RootNodeUpdated(string node, bytes32 newRoot);
    event MerkleRootUpdated(string root, bytes32 newRoot);

    constructor(IENS _ens, INameWrapper _nameWrapper, bytes32 _clubRootNode) Ownable(msg.sender) {
        ens = _ens;
        if (address(_ens) != address(0)) {
            emit ENSUpdated(address(_ens));
        }
        nameWrapper = _nameWrapper;
        if (address(_nameWrapper) != address(0)) {
            emit NameWrapperUpdated(address(_nameWrapper));
        }
        clubRootNode = _clubRootNode;
        if (_clubRootNode != bytes32(0)) {
            emit ClubRootNodeUpdated(_clubRootNode);
        }
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Update ENS registry address
    /// @param ensAddr New ENS registry contract address
    function setENS(address ensAddr) external onlyOwner {
        ens = IENS(ensAddr);
        emit ENSUpdated(ensAddr);
    }

    /// @notice Update ENS NameWrapper address
    /// @param wrapper New ENS NameWrapper contract address
    function setNameWrapper(address wrapper) external onlyOwner {
        nameWrapper = INameWrapper(wrapper);
        emit NameWrapperUpdated(wrapper);
    }

    /// @notice Update both agent and club root nodes in a single call.
    function setRootNodes(bytes32 agentRoot, bytes32 clubRoot) external onlyOwner {
        agentRootNode = agentRoot;
        clubRootNode = clubRoot;
        emit AgentRootNodeUpdated(agentRoot);
        emit ClubRootNodeUpdated(clubRoot);
        emit RootNodeUpdated("agent", agentRoot);
        emit RootNodeUpdated("club", clubRoot);
    }

    /// @notice Update both agent and validator Merkle roots in a single call.
    function setMerkleRoots(bytes32 agentRoot, bytes32 validatorRoot) external onlyOwner {
        agentMerkleRoot = agentRoot;
        validatorMerkleRoot = validatorRoot;
        emit AgentMerkleRootUpdated(agentRoot);
        emit ValidatorMerkleRootUpdated(validatorRoot);
        emit MerkleRootUpdated("agent", agentRoot);
        emit MerkleRootUpdated("validator", validatorRoot);
    }

    /// @notice Update club (validator) root node
    /// @param root New club root node hash
    function setClubRootNode(bytes32 root) external onlyOwner {
        clubRootNode = root;
        emit ClubRootNodeUpdated(root);
    }

    /// @notice Update agent root node
    /// @param root New agent root node hash
    function setAgentRootNode(bytes32 root) external onlyOwner {
        agentRootNode = root;
        emit AgentRootNodeUpdated(root);
    }

    /// @notice Update validator Merkle root
    /// @param root New validator allowlist Merkle root
    function setValidatorMerkleRoot(bytes32 root) external onlyOwner {
        validatorMerkleRoot = root;
        emit ValidatorMerkleRootUpdated(root);
        emit MerkleRootUpdated("validator", root);
    }

    /// @notice Update agent Merkle root
    function setAgentMerkleRoot(bytes32 root) external onlyOwner {
        agentMerkleRoot = root;
        emit AgentMerkleRootUpdated(root);
        emit MerkleRootUpdated("agent", root);
    }

    /// @notice Verify agent ownership of an ENS subdomain.
    function verifyAgent(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool) {
        return _verifyOwnership(claimant, subdomain, proof, agentRootNode);
    }

    /// @notice Verify validator ownership of an ENS subdomain.
    function verifyValidator(
        address claimant,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external returns (bool) {
        return _verifyOwnership(claimant, subdomain, proof, clubRootNode);
    }

    /// @notice Internal ownership verification logic shared by agents and validators.
    function _verifyOwnership(
        address claimant,
        string memory subdomain,
        bytes32[] calldata proof,
        bytes32 rootNode
    ) internal returns (bool) {
        (bool ok, string memory reason) = VerifyOwnership.verifyOwnership(
            claimant,
            subdomain,
            proof,
            rootNode,
            clubRootNode,
            agentRootNode,
            validatorMerkleRoot,
            agentMerkleRoot,
            ens,
            nameWrapper
        );
        if (ok) {
            emit OwnershipVerified(claimant, subdomain);
            return true;
        }
        if (bytes(reason).length != 0) {
            emit RecoveryInitiated(reason);
        }
        return false;
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("ENSOwnershipVerifier: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("ENSOwnershipVerifier: no ether");
    }
}
