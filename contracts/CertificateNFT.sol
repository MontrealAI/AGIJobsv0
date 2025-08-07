// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CertificateNFT
/// @notice ERC721 certificate minted upon successful job completion.
contract CertificateNFT is ERC721, Ownable {
    uint256 public nextId;
    string private baseTokenURI;

    event BaseURIUpdated(string newURI);

    constructor(string memory name_, string memory symbol_, address owner)
        ERC721(name_, symbol_)
        Ownable(owner)
    {}

    /// @notice Update the base token URI.
    function setBaseURI(string memory uri) external onlyOwner {
        baseTokenURI = uri;
        emit BaseURIUpdated(uri);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    /// @notice Mint a new certificate to `to`.
    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = ++nextId;
        _safeMint(to, tokenId);
    }
}

