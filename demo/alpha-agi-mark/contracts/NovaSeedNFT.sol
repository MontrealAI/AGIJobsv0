// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NovaSeedNFT
 * @notice Minimal ERC-721 representing a foresight opportunity that graduates through α-AGI MARK.
 * @dev Only the contract owner can mint or update metadata, keeping issuance tightly governed.
 */
contract NovaSeedNFT is ERC721URIStorage, Ownable {
    uint256 private _nextId = 1;

    event NovaSeedMinted(uint256 indexed tokenId, address indexed to, string uri);
    event NovaSeedUriUpdated(uint256 indexed tokenId, string uri);

    constructor(address owner_) ERC721("Alpha AGI Nova-Seed", "ASEED") Ownable(owner_) {}

    function mint(address to, string calldata uri) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextId;
        _nextId += 1;
        _safeMint(to, tokenId);
        if (bytes(uri).length > 0) {
            _setTokenURI(tokenId, uri);
        }
        emit NovaSeedMinted(tokenId, to, uri);
    }

    function updateTokenURI(uint256 tokenId, string calldata uri) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Seed does not exist");
        _setTokenURI(tokenId, uri);
        emit NovaSeedUriUpdated(tokenId, uri);
    }

    function nextId() external view returns (uint256) {
        return _nextId;
    }
}
