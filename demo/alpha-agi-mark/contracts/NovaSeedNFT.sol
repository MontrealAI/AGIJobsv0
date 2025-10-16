// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NovaSeedNFT
 * @notice Minimal ERC-721 representing an α-AGI Nova-Seed foresight artifact.
 */
contract NovaSeedNFT is ERC721, Ownable {
    uint256 private _nextId = 1;
    mapping(uint256 => string) private _tokenURIs;

    constructor(address owner_) ERC721("alpha-AGI Nova-Seed", "NOVA-SEED") Ownable(owner_) {
        require(owner_ != address(0), "owner zero");
    }

    function mint(address to, string memory tokenUri) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextId;
        _nextId += 1;
        _safeMint(to, tokenId);
        _tokenURIs[tokenId] = tokenUri;
    }

    function setTokenURI(uint256 tokenId, string calldata tokenUri) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "nonexistent token");
        _tokenURIs[tokenId] = tokenUri;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "nonexistent token");
        return _tokenURIs[tokenId];
    }
}
