// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";

/// @title CultureRegistry
/// @notice Registry for durable knowledge artifacts and their citation graph.
/// @dev Invariants:
/// - Artifact identifiers increment sequentially and are never reused.
/// - `_artifacts[id].author != address(0)` is the sole indicator of artifact existence.
/// - Citation arrays only contain unique, existing artifact identifiers.
/// Emergency procedures:
/// - The owner can call {pause} to freeze mints and citation updates and
///   {setIdentityRegistry} to rotate compromised identity infrastructure.
contract CultureRegistry is Ownable, Pausable, ReentrancyGuard {
    /// @notice Metadata stored for each artifact entry.
    struct Artifact {
        address author;
        string kind;
        string uri;
        uint64 createdAt;
        uint256 parentId;
        uint256[] citations;
    }

    /// @notice View helper that returns dynamic citation data in memory.
    struct ArtifactView {
        address author;
        string kind;
        string uri;
        uint64 createdAt;
        uint256 parentId;
        uint256[] citations;
    }

    /// @notice External registry providing ENS backed role attestations.
    IIdentityRegistry public identityRegistry;

    /// @notice Maximum number of citations allowed per artifact.
    uint256 public maxCitations;

    /// @dev Incremental counter used to derive the next artifact identifier.
    uint256 private _artifactIdCounter;

    /// @dev Mapping of artifact identifier to metadata.
    mapping(uint256 => Artifact) private _artifacts;

    /// @dev Optional allow-list of artifact kinds hashed for efficient lookup.
    mapping(bytes32 => bool) private _allowedKinds;

    /// @dev Tracks whether at least one explicit kind has been configured.
    bool private _kindsConfigured;

    event ArtifactMinted(
        uint256 indexed artifactId,
        address indexed author,
        string kind,
        string uri,
        uint256 parentId
    );
    event ArtifactCited(uint256 indexed artifactId, uint256 indexed citedArtifactId);
    event AllowedKindUpdated(string indexed kind, bool allowed);
    event MaxCitationsUpdated(uint256 newMax);
    event IdentityRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);

    error InvalidKind();
    error InvalidURI();
    error InvalidParent(uint256 parentId);
    error InvalidCitation(uint256 citedId);
    error DuplicateCitation(uint256 citedId);
    error SelfCitation(uint256 artifactId);
    error TooManyCitations(uint256 attempted, uint256 maxAllowed);
    error NotAuthorised(address caller);
    error ZeroAddress();
    error IdentityRegistryNotSet();

    constructor(
        address owner_,
        address identityRegistry_,
        string[] memory initialKinds,
        uint256 maxCitations_
    ) Ownable(owner_) {
        if (maxCitations_ == 0) {
            revert TooManyCitations(0, 0);
        }
        identityRegistry = IIdentityRegistry(identityRegistry_);
        maxCitations = maxCitations_;

        if (initialKinds.length > 0) {
            _kindsConfigured = true;
        }
        for (uint256 i; i < initialKinds.length; ++i) {
            bytes32 key = keccak256(bytes(initialKinds[i]));
            _allowedKinds[key] = true;
            emit AllowedKindUpdated(initialKinds[i], true);
        }
    }

    /// @notice Returns the total number of minted artifacts.
    function totalArtifacts() external view returns (uint256) {
        return _artifactIdCounter;
    }

    /// @notice Checks if an artifact kind is authorised for minting.
    function isAllowedKind(string memory kind) public view returns (bool) {
        if (!_kindsConfigured) {
            return true;
        }
        return _allowedKinds[keccak256(bytes(kind))];
    }

    /// @notice Fetch artifact metadata and citations.
    function getArtifact(uint256 artifactId) external view returns (ArtifactView memory viewData) {
        Artifact storage stored = _artifacts[artifactId];
        if (stored.author == address(0)) {
            revert InvalidParent(artifactId);
        }
        uint256 citationsLength = stored.citations.length;
        uint256[] memory cites = new uint256[](citationsLength);
        for (uint256 i; i < citationsLength; ++i) {
            cites[i] = stored.citations[i];
        }
        viewData = ArtifactView({
            author: stored.author,
            kind: stored.kind,
            uri: stored.uri,
            createdAt: stored.createdAt,
            parentId: stored.parentId,
            citations: cites
        });
    }

    /// @notice Mint a new artifact and optionally attach citations.
    /// @param kind Classifier describing the artifact.
    /// @param uri Off-chain URI (IPFS, HTTPS) that hosts the artifact payload.
    /// @param parentId Optional parent artifact identifier (0 for none).
    /// @param citations Array of cited artifact identifiers.
    /// @param subdomain ENS label controlled by the caller for identity attestation.
    /// @param proof Merkle proof attesting to the caller's membership in the author list.
    function mintArtifact(
        string calldata kind,
        string calldata uri,
        uint256 parentId,
        uint256[] calldata citations,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external whenNotPaused nonReentrant returns (uint256 artifactId) {
        _requireAuthorised(msg.sender, subdomain, proof);

        if (bytes(kind).length == 0 || !isAllowedKind(kind)) {
            revert InvalidKind();
        }
        if (bytes(uri).length == 0) {
            revert InvalidURI();
        }
        if (citations.length > maxCitations) {
            revert TooManyCitations(citations.length, maxCitations);
        }

        if (parentId != 0) {
            _assertArtifactExists(parentId);
        }

        artifactId = ++_artifactIdCounter;
        Artifact storage artifact = _artifacts[artifactId];
        artifact.author = msg.sender;
        artifact.kind = kind;
        artifact.uri = uri;
        artifact.createdAt = uint64(block.timestamp);
        artifact.parentId = parentId;

        if (citations.length != 0) {
            _validateAndStoreCitations(artifactId, artifact, citations);
        }

        emit ArtifactMinted(artifactId, msg.sender, kind, uri, parentId);
        for (uint256 i; i < citations.length; ++i) {
            emit ArtifactCited(artifactId, citations[i]);
        }
    }

    /// @notice Append an additional citation to an existing artifact.
    /// @param artifactId Identifier of the artifact being updated.
    /// @param citedArtifactId Identifier of the referenced artifact.
    function cite(uint256 artifactId, uint256 citedArtifactId)
        external
        whenNotPaused
        nonReentrant
    {
        Artifact storage artifact = _artifacts[artifactId];
        if (artifact.author == address(0)) {
            revert InvalidParent(artifactId);
        }
        if (msg.sender != artifact.author && msg.sender != owner()) {
            revert NotAuthorised(msg.sender);
        }
        if (artifact.citations.length >= maxCitations) {
            revert TooManyCitations(artifact.citations.length + 1, maxCitations);
        }
        if (artifactId == citedArtifactId) {
            revert SelfCitation(artifactId);
        }
        _assertArtifactExists(citedArtifactId);
        uint256 length = artifact.citations.length;
        for (uint256 i; i < length; ++i) {
            if (artifact.citations[i] == citedArtifactId) {
                revert DuplicateCitation(citedArtifactId);
            }
        }
        artifact.citations.push(citedArtifactId);
        emit ArtifactCited(artifactId, citedArtifactId);
    }

    /// @notice Owner can toggle specific artifact kinds.
    function setAllowedKind(string calldata kind, bool allowed) external onlyOwner {
        bytes32 key = keccak256(bytes(kind));
        _allowedKinds[key] = allowed;
        if (allowed) {
            _kindsConfigured = true;
        }
        emit AllowedKindUpdated(kind, allowed);
    }

    /// @notice Update the maximum permitted citations per artifact.
    function setMaxCitations(uint256 newMax) external onlyOwner {
        if (newMax == 0) {
            revert TooManyCitations(0, maxCitations);
        }
        maxCitations = newMax;
        emit MaxCitationsUpdated(newMax);
    }

    /// @notice Update the external identity registry reference.
    function setIdentityRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) {
            revert ZeroAddress();
        }
        address previous = address(identityRegistry);
        identityRegistry = IIdentityRegistry(newRegistry);
        emit IdentityRegistryUpdated(previous, newRegistry);
    }

    /// @notice Pause mutating operations in the registry.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume minting and citation updates.
    function unpause() external onlyOwner {
        _unpause();
    }

    function _requireAuthorised(address account, string calldata subdomain, bytes32[] calldata proof)
        internal
        view
    {
        if (account == owner()) {
            return;
        }
        IIdentityRegistry registry = identityRegistry;
        if (address(registry) == address(0)) {
            revert IdentityRegistryNotSet();
        }
        if (bytes(subdomain).length == 0) {
            revert NotAuthorised(account);
        }
        bool ok = registry.isAuthorizedAgent(account, subdomain, proof);
        if (!ok) {
            revert NotAuthorised(account);
        }
    }

    function _validateAndStoreCitations(
        uint256 artifactId,
        Artifact storage artifact,
        uint256[] calldata citations
    ) internal {
        uint256 length = citations.length;
        for (uint256 i; i < length; ++i) {
            uint256 citedId = citations[i];
            if (artifactId == citedId) {
                revert SelfCitation(artifactId);
            }
            _assertArtifactExists(citedId);
            for (uint256 j; j < i; ++j) {
                if (citations[j] == citedId) {
                    revert DuplicateCitation(citedId);
                }
            }
            artifact.citations.push(citedId);
        }
    }

    function _assertArtifactExists(uint256 artifactId) internal view {
        if (artifactId == 0) {
            revert InvalidCitation(artifactId);
        }
        Artifact storage candidate = _artifacts[artifactId];
        if (candidate.author == address(0)) {
            revert InvalidCitation(artifactId);
        }
    }
}
