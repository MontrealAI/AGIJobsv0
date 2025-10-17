// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Pausable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AlphaInsightNovaSeed
/// @notice ERC-721 foresight asset with owner-governed minting, sealing and reveal controls.
contract AlphaInsightNovaSeed is ERC721, ERC721Pausable, Ownable {
    struct InsightInput {
        string sector;
        string thesis;
        uint64 disruptionTimestamp;
        string sealedURI;
    }

    struct InsightMetadata {
        string sector;
        string thesis;
        uint64 disruptionTimestamp;
        string sealedURI;
        string fusionURI;
        bool fusionRevealed;
        address originalMinter;
        uint256 mintedAt;
    }

    uint256 private _nextTokenId = 1;
    mapping(uint256 => InsightMetadata) private _insights;
    mapping(address => bool) private _authorizedMinters;
    address private _systemPause;

    event InsightMinted(
        uint256 indexed tokenId,
        address indexed to,
        string sector,
        string thesis,
        uint64 disruptionTimestamp,
        string sealedURI
    );

    event InsightUpdated(
        uint256 indexed tokenId,
        string sector,
        string thesis,
        uint64 disruptionTimestamp
    );

    event FusionPlanRevealed(uint256 indexed tokenId, string fusionURI);
    event FusionPlanUpdated(uint256 indexed tokenId, string fusionURI);

    event MinterUpdated(address indexed account, bool authorized);
    event SystemPauseUpdated(address indexed account);

    constructor(address owner_) ERC721(unicode"α-AGI Nova-Seed", "AINSIGHT") Ownable(owner_) {}

    modifier onlyAuthorized() {
        if (msg.sender != owner() && !_authorizedMinters[msg.sender]) {
            revert("NOT_AUTHORIZED");
        }
        _;
    }

    modifier onlyOwnerOrSystemPause() {
        if (msg.sender != owner() && msg.sender != _systemPause) {
            revert("NOT_AUTHORIZED");
        }
        _;
    }

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function isMinter(address account) external view returns (bool) {
        if (account == owner()) {
            return true;
        }
        return _authorizedMinters[account];
    }

    function setMinter(address account, bool authorized) external onlyOwner {
        _authorizedMinters[account] = authorized;
        emit MinterUpdated(account, authorized);
    }

    function systemPause() external view returns (address) {
        return _systemPause;
    }

    function setSystemPause(address newSystemPause) external onlyOwner {
        _systemPause = newSystemPause;
        emit SystemPauseUpdated(newSystemPause);
    }

    function mintInsight(address to, InsightInput calldata input)
        external
        onlyAuthorized
        whenNotPaused
        returns (uint256 tokenId)
    {
        require(bytes(input.sector).length > 0, "SECTOR_REQUIRED");
        require(bytes(input.thesis).length > 0, "THESIS_REQUIRED");
        require(bytes(input.sealedURI).length > 0, "URI_REQUIRED");

        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _insights[tokenId] = InsightMetadata({
            sector: input.sector,
            thesis: input.thesis,
            disruptionTimestamp: input.disruptionTimestamp,
            sealedURI: input.sealedURI,
            fusionURI: input.sealedURI,
            fusionRevealed: false,
            originalMinter: msg.sender,
            mintedAt: block.timestamp
        });

        emit InsightMinted(
            tokenId,
            to,
            input.sector,
            input.thesis,
            input.disruptionTimestamp,
            input.sealedURI
        );
    }

    function updateInsightDetails(
        uint256 tokenId,
        string calldata sector,
        string calldata thesis,
        uint64 disruptionTimestamp
    ) external onlyOwner {
        _requireOwned(tokenId);
        InsightMetadata storage info = _insights[tokenId];
        info.sector = sector;
        info.thesis = thesis;
        info.disruptionTimestamp = disruptionTimestamp;
        emit InsightUpdated(tokenId, sector, thesis, disruptionTimestamp);
    }

    function updateSealedURI(uint256 tokenId, string calldata newURI) external onlyOwner {
        _requireOwned(tokenId);
        require(bytes(newURI).length > 0, "URI_REQUIRED");
        InsightMetadata storage info = _insights[tokenId];
        info.sealedURI = newURI;
        if (!info.fusionRevealed) {
            info.fusionURI = newURI;
        }
        emit InsightUpdated(tokenId, info.sector, info.thesis, info.disruptionTimestamp);
    }

    function revealFusionPlan(uint256 tokenId, string calldata fusionURI) external onlyOwner {
        _requireOwned(tokenId);
        require(bytes(fusionURI).length > 0, "URI_REQUIRED");
        InsightMetadata storage info = _insights[tokenId];
        info.fusionURI = fusionURI;
        info.fusionRevealed = true;
        emit FusionPlanRevealed(tokenId, fusionURI);
    }

    function updateFusionPlan(uint256 tokenId, string calldata fusionURI) external onlyOwner {
        _requireOwned(tokenId);
        require(bytes(fusionURI).length > 0, "URI_REQUIRED");
        InsightMetadata storage info = _insights[tokenId];
        info.fusionURI = fusionURI;
        info.fusionRevealed = true;
        emit FusionPlanUpdated(tokenId, fusionURI);
    }

    function getInsight(uint256 tokenId) external view returns (InsightMetadata memory) {
        _requireOwned(tokenId);
        return _insights[tokenId];
    }

    function pause() external onlyOwnerOrSystemPause {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        InsightMetadata memory info = _insights[tokenId];
        return info.fusionURI;
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Pausable)
        whenNotPaused
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
