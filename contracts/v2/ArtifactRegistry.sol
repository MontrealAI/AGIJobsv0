// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";

/// @title ArtifactRegistry
/// @notice ERC721 registry that tracks cultural artifacts and their citation graph.
contract ArtifactRegistry is ERC721, Ownable, AccessControl, Pausable, ReentrancyGuard {
    /// @notice Author role recognised by the registry.
    bytes32 public constant AUTHOR_ROLE = keccak256("AUTHOR_ROLE");

    /// @notice Depth limit used when traversing the citation graph during minting.
    uint256 public constant DFS_DEPTH_LIMIT = 64;

    /// @notice Metadata describing a minted artifact.
    struct Artifact {
        string cid;
        string kind;
        uint256[] citations;
        bytes32 lineageHash;
        uint64 mintedAt;
        uint256 influence;
    }

    /// @notice Maximum number of citations that can be recorded for a single artifact.
    uint256 public maxCitations;

    /// @notice External identity registry used for author verification.
    IIdentityRegistry public identityRegistry;

    /// @dev Incrementing token identifier (starts at 1).
    uint256 private _nextTokenId;

    /// @dev Storage for artifact metadata.
    mapping(uint256 => Artifact) private _artifacts;

    /// @dev Tracks lineage hashes to guarantee uniqueness.
    mapping(bytes32 => uint256) private _lineageToToken;

    event ArtifactMinted(uint256 indexed tokenId, address indexed author, string cid, string kind, bytes32 lineageHash);
    event ArtifactCited(uint256 indexed tokenId, uint256 indexed citedTokenId);
    event ArtifactInfluenceUpdated(uint256 indexed tokenId, uint256 newInfluence);
    event ArtifactMetadataUpdated(uint256 indexed tokenId, string cid, string kind, bytes32 lineageHash);
    event MaxCitationsUpdated(uint256 newMaxCitations);
    event IdentityRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);

    error UnauthorizedAuthor(address account);
    error InvalidIdentityRegistry();
    error IdentityRegistryNotSet();
    error InvalidSubdomain();
    error EmptyCID();
    error EmptyKind();
    error UnknownArtifact(uint256 tokenId);
    error DuplicateCitation(uint256 citedTokenId);
    error CitationCycle(uint256 startTokenId, uint256 loopTokenId);
    error CitationDepthExceeded(uint256 depthLimit);
    error LineageHashInUse(bytes32 lineageHash, uint256 existingTokenId);
    error MaxCitationsExceeded(uint256 attempted, uint256 maxAllowed);
    error NotTokenOwnerOrApproved(uint256 tokenId, address caller);

    constructor(string memory name_, string memory symbol_, uint256 maxCitations_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {
        if (maxCitations_ == 0) revert MaxCitationsExceeded(0, 0);

        maxCitations = maxCitations_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(AUTHOR_ROLE, msg.sender);
    }

    /// @notice Mint a new artifact NFT and register its metadata.
    /// @param cid IPFS or metadata content identifier for the artifact body.
    /// @param kind Human readable artifact kind (e.g. "prompt", "model").
    /// @param lineageHash Hash summarising the artifact's lineage to guarantee uniqueness.
    /// @param citations List of artifact ids that this artifact cites.
    /// @param subdomain ENS-like identifier supplied for IdentityRegistry attestation.
    /// @param proof Merkle proof accompanying the IdentityRegistry verification.
    /// @return tokenId Identifier of the newly minted artifact NFT.
    function mintArtifact(
        string calldata cid,
        string calldata kind,
        bytes32 lineageHash,
        uint256[] calldata citations,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external whenNotPaused nonReentrant returns (uint256 tokenId) {
        _assertAuthorised(msg.sender, subdomain, proof);
        if (bytes(cid).length == 0) revert EmptyCID();
        if (bytes(kind).length == 0) revert EmptyKind();

        if (citations.length > maxCitations) revert MaxCitationsExceeded(citations.length, maxCitations);

        if (_lineageToToken[lineageHash] != 0) {
            revert LineageHashInUse(lineageHash, _lineageToToken[lineageHash]);
        }

        tokenId = ++_nextTokenId;
        _enforceCitationInvariants(tokenId, citations);
        Artifact storage artifact = _artifacts[tokenId];
        artifact.cid = cid;
        artifact.kind = kind;
        artifact.lineageHash = lineageHash;
        artifact.mintedAt = uint64(block.timestamp);

        _storeCitations(tokenId, artifact, citations);
        _lineageToToken[lineageHash] = tokenId;

        _safeMint(msg.sender, tokenId);

        emit ArtifactMinted(tokenId, msg.sender, cid, kind, lineageHash);
    }

    /// @notice Update mutable metadata for an artifact.
    /// @dev Only token owner or approved operator may update metadata.
    function updateArtifactMetadata(uint256 tokenId, string calldata cid, string calldata kind, bytes32 lineageHash)
        external
        whenNotPaused
        nonReentrant
    {
        address tokenOwner = _ownerOf(tokenId);
        if (tokenOwner == address(0)) revert UnknownArtifact(tokenId);
        if (msg.sender != tokenOwner && getApproved(tokenId) != msg.sender && !isApprovedForAll(tokenOwner, msg.sender))
        {
            revert NotTokenOwnerOrApproved(tokenId, msg.sender);
        }
        if (bytes(cid).length == 0) revert EmptyCID();
        if (bytes(kind).length == 0) revert EmptyKind();

        Artifact storage artifact = _artifacts[tokenId];
        bytes32 previousHash = artifact.lineageHash;
        if (lineageHash != previousHash) {
            uint256 existing = _lineageToToken[lineageHash];
            if (existing != 0 && existing != tokenId) {
                revert LineageHashInUse(lineageHash, existing);
            }
            if (previousHash != bytes32(0)) {
                _lineageToToken[previousHash] = 0;
            }
            _lineageToToken[lineageHash] = tokenId;
            artifact.lineageHash = lineageHash;
        }

        artifact.cid = cid;
        artifact.kind = kind;

        emit ArtifactMetadataUpdated(tokenId, cid, kind, lineageHash);
    }

    /// @notice Retrieve immutable and mutable metadata for an artifact.
    function getArtifact(uint256 tokenId) external view returns (Artifact memory) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownArtifact(tokenId);

        Artifact storage stored = _artifacts[tokenId];
        Artifact memory copy;
        copy.cid = stored.cid;
        copy.kind = stored.kind;
        copy.lineageHash = stored.lineageHash;
        copy.mintedAt = stored.mintedAt;
        copy.influence = stored.influence;

        uint256 length = stored.citations.length;
        copy.citations = new uint256[](length);
        for (uint256 i; i < length; ++i) {
            copy.citations[i] = stored.citations[i];
        }
        return copy;
    }

    /// @notice Return the owner of a lineage hash if registered.
    function lineageOwner(bytes32 lineageHash) external view returns (uint256 tokenId) {
        return _lineageToToken[lineageHash];
    }

    /// @notice Update the maximum permitted citations per artifact.
    function setMaxCitations(uint256 newMax) external onlyOwner {
        if (newMax == 0) revert MaxCitationsExceeded(0, maxCitations);
        maxCitations = newMax;
        emit MaxCitationsUpdated(newMax);
    }

    /// @notice Pause mutating operations.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume minting and metadata updates.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Configure the external IdentityRegistry used for author verification.
    function setIdentityRegistry(IIdentityRegistry newRegistry) external onlyOwner {
        if (address(newRegistry) == address(0)) revert InvalidIdentityRegistry();
        if (newRegistry.version() != 2) revert InvalidIdentityRegistry();

        address previous = address(identityRegistry);
        identityRegistry = newRegistry;

        emit IdentityRegistryUpdated(previous, address(newRegistry));
    }

    /// @notice Helper returning the next token identifier that will be assigned.
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId + 1;
    }

    /// @inheritdoc ERC721
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownArtifact(tokenId);
        return _artifacts[tokenId].cid;
    }

    /// @inheritdoc AccessControl
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _storeCitations(uint256 tokenId, Artifact storage artifact, uint256[] calldata citations) internal {
        uint256 length = citations.length;
        for (uint256 i; i < length; ++i) {
            uint256 citedId = citations[i];
            artifact.citations.push(citedId);
            Artifact storage cited = _artifacts[citedId];
            cited.influence += 1;
            emit ArtifactInfluenceUpdated(citedId, cited.influence);
            emit ArtifactCited(tokenId, citedId);
        }
    }

    function _assertAuthorised(address account, string calldata subdomain, bytes32[] calldata proof) internal view {
        if (hasRole(AUTHOR_ROLE, account)) {
            return;
        }

        IIdentityRegistry registry = identityRegistry;
        if (address(registry) == address(0)) revert IdentityRegistryNotSet();
        if (bytes(subdomain).length == 0) revert InvalidSubdomain();

        bool ok = registry.isAuthorizedAgent(account, subdomain, proof);
        if (!ok) revert UnauthorizedAuthor(account);
    }

    function _enforceCitationInvariants(uint256 tokenId, uint256[] calldata citations) internal view {
        uint256 length = citations.length;
        uint256[] memory path = new uint256[](DFS_DEPTH_LIMIT);
        for (uint256 i; i < length; ++i) {
            uint256 citedId = citations[i];
            _assertArtifactExists(citedId);

            for (uint256 j; j < i; ++j) {
                if (citations[j] == citedId) revert DuplicateCitation(citedId);
            }

            _verifyAcyclic(tokenId, citedId, 0, path);
        }
    }

    function _verifyAcyclic(uint256 originId, uint256 currentId, uint256 depth, uint256[] memory path) internal view {
        if (depth >= DFS_DEPTH_LIMIT) revert CitationDepthExceeded(DFS_DEPTH_LIMIT);
        path[depth] = currentId;

        Artifact storage node = _artifacts[currentId];
        uint256 length = node.citations.length;
        for (uint256 i; i < length; ++i) {
            uint256 nextId = node.citations[i];
            if (nextId == originId) revert CitationCycle(originId, currentId);

            for (uint256 j; j <= depth; ++j) {
                if (path[j] == nextId) revert CitationCycle(originId, nextId);
            }

            _verifyAcyclic(originId, nextId, depth + 1, path);
        }
    }

    function _assertArtifactExists(uint256 tokenId) internal view {
        if (tokenId == 0 || _ownerOf(tokenId) == address(0)) revert UnknownArtifact(tokenId);
    }
}
