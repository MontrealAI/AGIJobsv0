// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IIdentityRegistry {
    function hasRole(bytes32 role, address account) external view returns (bool);
}

/// @title CultureRegistry
/// @notice On-chain registry for culture artifacts with lineage and citation graph.
contract CultureRegistry is Ownable, Pausable, ReentrancyGuard {
    /// @dev Role hash recognised in the IdentityRegistry for authorised authors.
    bytes32 public constant AUTHOR_ROLE = keccak256("AUTHOR_ROLE");

    struct Artifact {
        address author;
        string kind;
        string cid;
        uint64 createdAt;
        uint256 parentId;
        uint256[] cites;
    }

    struct ArtifactView {
        address author;
        string kind;
        string cid;
        uint64 createdAt;
        uint256 parentId;
        uint256[] cites;
    }

    /// @dev Incremental identifier for artifacts (starts at 1).
    uint256 private _artifactIdCounter;

    /// @dev Mapping of artifact id to metadata.
    mapping(uint256 => Artifact) private _artifacts;

    /// @dev Allowed artifact kinds hashed for efficient lookup.
    mapping(bytes32 => bool) private _allowedKinds;

    /// @dev Maximum number of citations permitted per artifact.
    uint256 public maxCitations;

    /// @dev External identity registry for role-based access control.
    IIdentityRegistry public identityRegistry;

    event ArtifactMinted(
        uint256 indexed artifactId,
        address indexed author,
        string kind,
        string cid,
        uint256 parentId
    );
    event ArtifactCited(uint256 indexed artifactId, uint256 indexed citedArtifactId);
    event AllowedKindUpdated(string indexed kind, bool allowed);
    event MaxCitationsUpdated(uint256 newMax);
    event IdentityRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);

    error InvalidKind();
    error InvalidCID();
    error InvalidParent();
    error InvalidCitation(uint256 citedId);
    error DuplicateCitation(uint256 citedId);
    error TooManyCitations(uint256 attempted, uint256 maxAllowed);
    error NotAuthorised();

    constructor(address owner_, address identityRegistry_, string[] memory initialKinds, uint256 maxCitations_)
        Ownable(owner_)
    {
        require(maxCitations_ > 0, "MaxTooLow");
        identityRegistry = IIdentityRegistry(identityRegistry_);
        maxCitations = maxCitations_;

        if (initialKinds.length > 0) {
            _kindsConfigured = true;
        }

        for (uint256 i = 0; i < initialKinds.length; i++) {
            _allowedKinds[keccak256(bytes(initialKinds[i]))] = true;
            emit AllowedKindUpdated(initialKinds[i], true);
        }
    }

    /// @notice Returns the total number of artifacts minted.
    function totalArtifacts() external view returns (uint256) {
        return _artifactIdCounter;
    }

    /// @notice Checks whether a kind is authorised for minting.
    function isAllowedKind(string memory kind) public view returns (bool) {
        bytes32 key = keccak256(bytes(kind));
        bool configured = _allowedKinds[key];
        // If no kinds configured, treat as open list.
        if (!_anyKindConfigured()) {
            return true;
        }
        return configured;
    }

    function _anyKindConfigured() internal view returns (bool) {
        // Gas-friendly approach: rely on maxCitations sentinel when array provided? Instead use state var.
        // Since Solidity cannot iterate mappings, we track via storage of boolean.
        return _kindsConfigured;
    }

    bool private _kindsConfigured;

    function _setKindConfiguredFlag() internal {
        if (!_kindsConfigured) {
            _kindsConfigured = true;
        }
    }

    /// @notice Mint a new artifact.
    function mintArtifact(
        string calldata kind,
        string calldata cid,
        uint256 parentId,
        uint256[] calldata cites
    ) external whenNotPaused nonReentrant returns (uint256 artifactId) {
        if (!_isAuthor(msg.sender)) revert NotAuthorised();
        if (bytes(kind).length == 0) revert InvalidKind();
        if (!isAllowedKind(kind)) revert InvalidKind();
        if (bytes(cid).length == 0) revert InvalidCID();
        if (cites.length > maxCitations) revert TooManyCitations(cites.length, maxCitations);

        if (parentId != 0 && !_artifactExists(parentId)) {
            revert InvalidParent();
        }

        artifactId = ++_artifactIdCounter;
        Artifact storage artifact = _artifacts[artifactId];
        artifact.author = msg.sender;
        artifact.kind = kind;
        artifact.cid = cid;
        artifact.createdAt = uint64(block.timestamp);
        artifact.parentId = parentId;

        if (cites.length > 0) {
            _validateAndStoreCitations(artifact, cites);
        }

        emit ArtifactMinted(artifactId, msg.sender, kind, cid, parentId);

        for (uint256 i = 0; i < cites.length; i++) {
            emit ArtifactCited(artifactId, cites[i]);
        }
    }

    /// @notice Append a citation to an existing artifact.
    function cite(uint256 artifactId, uint256 citedId) external whenNotPaused nonReentrant {
        Artifact storage artifact = _artifacts[artifactId];
        if (artifact.author == address(0)) revert InvalidParent();
        if (!_isAuthor(msg.sender) && msg.sender != owner() && msg.sender != artifact.author) {
            revert NotAuthorised();
        }
        if (!_artifactExists(citedId)) revert InvalidCitation(citedId);
        if (artifact.cites.length >= maxCitations) {
            revert TooManyCitations(artifact.cites.length + 1, maxCitations);
        }
        for (uint256 i = 0; i < artifact.cites.length; i++) {
            if (artifact.cites[i] == citedId) revert DuplicateCitation(citedId);
        }
        artifact.cites.push(citedId);
        emit ArtifactCited(artifactId, citedId);
    }

    /// @notice Retrieve artifact metadata.
    function getArtifact(uint256 artifactId) external view returns (ArtifactView memory) {
        Artifact storage artifact = _artifacts[artifactId];
        require(artifact.author != address(0), "ArtifactNotFound");

        uint256 citesLength = artifact.cites.length;
        uint256[] memory citesCopy = new uint256[](citesLength);
        for (uint256 i = 0; i < citesLength; i++) {
            citesCopy[i] = artifact.cites[i];
        }

        return ArtifactView({
            author: artifact.author,
            kind: artifact.kind,
            cid: artifact.cid,
            createdAt: artifact.createdAt,
            parentId: artifact.parentId,
            cites: citesCopy
        });
    }

    /// @notice Owner can toggle allowed kinds. Supplying an empty list initially keeps registry open.
    function setAllowedKind(string calldata kind, bool allowed) external onlyOwner {
        bytes32 key = keccak256(bytes(kind));
        _allowedKinds[key] = allowed;
        if (allowed) {
            _setKindConfiguredFlag();
        }
        emit AllowedKindUpdated(kind, allowed);
    }

    /// @notice Owner can change the maximum allowed citations.
    function setMaxCitations(uint256 newMax) external onlyOwner {
        require(newMax > 0, "MaxTooLow");
        maxCitations = newMax;
        emit MaxCitationsUpdated(newMax);
    }

    /// @notice Owner can update the external identity registry reference.
    function setIdentityRegistry(address newRegistry) external onlyOwner {
        address previous = address(identityRegistry);
        identityRegistry = IIdentityRegistry(newRegistry);
        emit IdentityRegistryUpdated(previous, newRegistry);
    }

    /// @notice Pause minting and citation updates.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume minting and citation updates.
    function unpause() external onlyOwner {
        _unpause();
    }

    function _validateAndStoreCitations(Artifact storage artifact, uint256[] calldata cites) internal {
        uint256 length = cites.length;
        for (uint256 i = 0; i < length; i++) {
            uint256 citedId = cites[i];
            if (!_artifactExists(citedId)) revert InvalidCitation(citedId);
            for (uint256 j = 0; j < i; j++) {
                if (cites[j] == citedId) revert DuplicateCitation(citedId);
            }
            artifact.cites.push(citedId);
        }
    }

    function _artifactExists(uint256 artifactId) internal view returns (bool) {
        return artifactId != 0 && artifactId <= _artifactIdCounter && _artifacts[artifactId].author != address(0);
    }

    function _isAuthor(address account) internal view returns (bool) {
        if (account == owner()) {
            return true;
        }
        if (address(identityRegistry) != address(0) && identityRegistry.hasRole(AUTHOR_ROLE, account)) {
            return true;
        }
        return false;
    }
}
