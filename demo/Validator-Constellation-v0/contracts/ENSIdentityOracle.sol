// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title ENSIdentityOracle
/// @notice Lightweight oracle that verifies ENS subdomain ownership through
///         Merkle proofs published by governance. Each leaf encodes the
///         controller address and fully qualified ENS name. The oracle treats
///         alpha network namespaces as equivalent to production namespaces so
///         that operators can rehearse with identical policies on staging.
contract ENSIdentityOracle is Ownable {
    using Strings for uint256;

    /// @notice Enumeration of supported identity roles.
    enum Role {
        Validator,
        Agent,
        Node
    }

    /// @notice Merkle root covering validator identities.
    bytes32 public validatorRoot;
    /// @notice Merkle root covering agent identities.
    bytes32 public agentRoot;
    /// @notice Merkle root covering node identities.
    bytes32 public nodeRoot;

    /// @notice Ensures ENS names terminate with approved suffixes.
    struct AllowedSuffixes {
        bytes primary;
        bytes alpha;
    }

    mapping(Role => AllowedSuffixes) internal allowedSuffixes;

    event MerkleRootsUpdated(bytes32 validatorRoot, bytes32 agentRoot, bytes32 nodeRoot);

    error InvalidENSName();
    error InvalidProof();
    error UnknownRole();

    constructor() Ownable(msg.sender) {
        allowedSuffixes[Role.Validator] = AllowedSuffixes({
            primary: bytes(".club.agi.eth"),
            alpha: bytes(".alpha.club.agi.eth")
        });
        allowedSuffixes[Role.Agent] = AllowedSuffixes({
            primary: bytes(".agent.agi.eth"),
            alpha: bytes(".alpha.agent.agi.eth")
        });
        allowedSuffixes[Role.Node] = AllowedSuffixes({
            primary: bytes(".node.agi.eth"),
            alpha: bytes(".alpha.node.agi.eth")
        });
    }

    /// @notice Update the Merkle roots used for identity verification.
    /// @dev Governance publishes signed Merkle trees derived from ENS
    ///      NameWrapper ownership snapshots. Those proofs allow the oracle to
    ///      enforce strict ENS identity policies without trusting individual
    ///      operators.
    function updateMerkleRoots(bytes32 validatorRoot_, bytes32 agentRoot_, bytes32 nodeRoot_) external onlyOwner {
        validatorRoot = validatorRoot_;
        agentRoot = agentRoot_;
        nodeRoot = nodeRoot_;
        emit MerkleRootsUpdated(validatorRoot_, agentRoot_, nodeRoot_);
    }

    /// @notice Verify that an address controls the ENS name required for a role.
    /// @param account The account claiming control of the ENS name.
    /// @param fqdn Fully-qualified ENS name (must be lowercase).
    /// @param role Identity role to validate.
    /// @param proof Merkle proof tying the account/name pair to the authorised root.
    function verify(address account, string calldata fqdn, Role role, bytes32[] calldata proof) public view returns (bool) {
        bytes32 root = _rootForRole(role);
        if (root == bytes32(0)) revert InvalidProof();

        if (!_hasApprovedSuffix(fqdn, role)) revert InvalidENSName();

        bytes32 leaf = keccak256(abi.encodePacked(account, keccak256(bytes(fqdn))));
        if (!MerkleProof.verify(proof, root, leaf)) revert InvalidProof();
        return true;
    }

    function _rootForRole(Role role) internal view returns (bytes32) {
        if (role == Role.Validator) {
            return validatorRoot;
        }
        if (role == Role.Agent) {
            return agentRoot;
        }
        if (role == Role.Node) {
            return nodeRoot;
        }
        revert UnknownRole();
    }

    function _hasApprovedSuffix(string calldata fqdn, Role role) internal view returns (bool) {
        bytes memory nameBytes = bytes(fqdn);
        if (nameBytes.length == 0) return false;

        AllowedSuffixes memory suffixes = allowedSuffixes[role];
        return _endsWith(nameBytes, suffixes.primary) || _endsWith(nameBytes, suffixes.alpha);
    }

    function _endsWith(bytes memory subject, bytes memory suffix) internal pure returns (bool) {
        if (subject.length < suffix.length) return false;
        uint256 start = subject.length - suffix.length;
        for (uint256 i = 0; i < suffix.length; i++) {
            if (subject[start + i] != suffix[i]) {
                return false;
            }
        }
        return true;
    }
}
