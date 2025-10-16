// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Pausable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title NovaSeedNFT
/// @notice Minimal ERC-721 representing an α-AGI foresight seed with owner-controlled minting.
contract NovaSeedNFT is ERC721, ERC721Pausable, Ownable {
    uint256 private _nextTokenId = 1;
    mapping(uint256 => string) private _tokenURIs;

    event SeedMinted(uint256 indexed tokenId, address indexed to, string uri);
    event SeedURIUpdated(uint256 indexed tokenId, string uri);

    constructor(address owner_) ERC721("Alpha AGI Nova-Seed", "NOVA-SEED") Ownable(owner_) {}

    function mintSeed(address to, string memory tokenURI_) external onlyOwner whenNotPaused returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _tokenURIs[tokenId] = tokenURI_;
        emit SeedMinted(tokenId, to, tokenURI_);
        return tokenId;
    }

    function updateSeedURI(uint256 tokenId, string memory tokenURI_) external onlyOwner {
        _requireOwned(tokenId);
        _tokenURIs[tokenId] = tokenURI_;
        emit SeedURIUpdated(tokenId, tokenURI_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
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
