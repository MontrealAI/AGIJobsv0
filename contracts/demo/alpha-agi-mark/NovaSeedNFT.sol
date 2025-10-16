// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title α-AGI Nova-Seed NFT
/// @notice Minimal ERC721 used to anchor foresight artefacts for the MARK demo.
contract NovaSeedNFT is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId = 1;

    event SeedMinted(uint256 indexed tokenId, address indexed to, string uri);

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner
    ) ERC721(name_, symbol_) Ownable(initialOwner) {}

    function mintSeed(address to, string memory tokenURI_) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);
        emit SeedMinted(tokenId, to, tokenURI_);
    }

    function updateTokenURI(uint256 tokenId, string memory tokenURI_) external onlyOwner {
        _setTokenURI(tokenId, tokenURI_);
    }

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    // ERC721URIStorage already handles burn/tokenURI wiring for metadata.
}
