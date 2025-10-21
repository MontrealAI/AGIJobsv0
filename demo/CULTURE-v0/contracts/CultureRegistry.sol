// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IIdentityRegistry {
    function hasRole(address account, bytes32 role) external view returns (bool);
}

/**
 * @title CultureRegistry
 * @notice Minimal yet production-focused registry for CULTURE artefacts. Designed so that
 *         cultural accumulation can be measured, cited, and governed on-chain with strong
 *         owner controls.
 */
contract CultureRegistry is Ownable, Pausable, ReentrancyGuard {
    struct Artifact {
        address author;
        string kind;
        string cid;
        uint64 createdAt;
        uint256 parentId;
        uint256[] cites;
    }

    event ArtifactMinted(uint256 indexed artifactId, address indexed author, string kind, string cid);
    event ArtifactCited(uint256 indexed artifactId, uint256 indexed citedId);
    event KindAllowlisted(string kind, bool allowed);
    event IdentityRegistryUpdated(address indexed identityRegistry);

    bytes32 public constant AUTHOR_ROLE = keccak256("AUTHOR_ROLE");

    IIdentityRegistry public identityRegistry;
    uint256 private _nextId = 1;
    uint256 public maxCitationsPerArtifact = 16;

    mapping(uint256 => Artifact) private _artifacts;
    mapping(string => bool) public allowlistedKinds;

    error NotAuthorised();
    error InvalidArtifact();
    error KindNotAllowlisted();
    error CitationLimitExceeded();

    constructor(address owner_, address identityRegistry_) Ownable(owner_) {
        identityRegistry = IIdentityRegistry(identityRegistry_);
        // Default to accepting books, prompts, datasets, curricula.
        allowlistedKinds["book"] = true;
        allowlistedKinds["prompt"] = true;
        allowlistedKinds["dataset"] = true;
        allowlistedKinds["curriculum"] = true;
    }

    function setIdentityRegistry(address identityRegistry_) external onlyOwner {
        identityRegistry = IIdentityRegistry(identityRegistry_);
        emit IdentityRegistryUpdated(identityRegistry_);
    }

    function setKindAllowlist(string calldata kind, bool allowed) external onlyOwner {
        allowlistedKinds[kind] = allowed;
        emit KindAllowlisted(kind, allowed);
    }

    function setMaxCitations(uint256 newLimit) external onlyOwner {
        maxCitationsPerArtifact = newLimit;
    }

    function artifact(uint256 artifactId) external view returns (Artifact memory) {
        Artifact storage data = _artifacts[artifactId];
        if (data.author == address(0)) {
            revert InvalidArtifact();
        }
        return data;
    }

    function mintArtifact(
        string calldata kind,
        string calldata cid,
        uint256 parentId,
        uint256[] calldata cites
    ) external whenNotPaused nonReentrant returns (uint256 artifactId) {
        _enforceAuthor(msg.sender);
        if (!allowlistedKinds[kind]) {
            revert KindNotAllowlisted();
        }
        if (cites.length > maxCitationsPerArtifact) {
            revert CitationLimitExceeded();
        }
        if (parentId != 0 && _artifacts[parentId].author == address(0)) {
            revert InvalidArtifact();
        }
        artifactId = _nextId++;
        Artifact storage stored = _artifacts[artifactId];
        stored.author = msg.sender;
        stored.kind = kind;
        stored.cid = cid;
        stored.createdAt = uint64(block.timestamp);
        stored.parentId = parentId;
        for (uint256 i = 0; i < cites.length; i++) {
            uint256 cited = cites[i];
            if (_artifacts[cited].author == address(0)) {
                revert InvalidArtifact();
            }
            stored.cites.push(cited);
            emit ArtifactCited(artifactId, cited);
        }
        emit ArtifactMinted(artifactId, msg.sender, kind, cid);
    }

    function cite(uint256 artifactId, uint256 citedId) external whenNotPaused nonReentrant {
        Artifact storage stored = _artifacts[artifactId];
        if (stored.author == address(0)) {
            revert InvalidArtifact();
        }
        if (msg.sender != stored.author) {
            _enforceAuthor(msg.sender);
        }
        if (_artifacts[citedId].author == address(0)) {
            revert InvalidArtifact();
        }
        if (stored.cites.length >= maxCitationsPerArtifact) {
            revert CitationLimitExceeded();
        }
        for (uint256 i = 0; i < stored.cites.length; i++) {
            if (stored.cites[i] == citedId) {
                return; // idempotent
            }
        }
        stored.cites.push(citedId);
        emit ArtifactCited(artifactId, citedId);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _enforceAuthor(address account) internal view {
        if (address(identityRegistry) != address(0)) {
            if (!identityRegistry.hasRole(account, AUTHOR_ROLE)) {
                revert NotAuthorised();
            }
        } else if (account != owner()) {
            // Fallback: only owner allowed if no identity registry configured.
            revert NotAuthorised();
        }
    }
}
