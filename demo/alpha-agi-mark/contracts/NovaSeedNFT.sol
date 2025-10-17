// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Pausable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title NovaSeedNFT
/// @notice Owner-governed ERC-721 collection that represents pre-launch foresight seeds.
/// @dev The contract purposefully keeps minting authority with the owner to mirror a
///      single governance source of truth. Metadata URIs can be curated per token or
///      by setting a global base URI prefix.
contract NovaSeedNFT is ERC721, ERC721Pausable, Ownable {
    /// @notice Revert thrown when querying metadata for an unknown token id.
    error SeedDoesNotExist(uint256 tokenId);

    /// @notice Emitted when a new seed token is minted.
    event SeedMinted(uint256 indexed tokenId, address indexed to, string uri);

    /// @notice Emitted when a seed token URI is updated.
    event SeedURIUpdated(uint256 indexed tokenId, string uri);

    /// @notice Emitted when a token is burned by the owner.
    event SeedBurned(uint256 indexed tokenId);

    /// @notice Emitted when the owner configures a new base URI prefix.
    event BaseUriUpdated(string baseUri);

    uint256 private _nextTokenId = 1;
    mapping(uint256 => string) private _tokenURIs;
    string private _baseUri;

    /// @param owner_ Account that gains minting and administrative authority.
    constructor(address owner_) ERC721("Alpha AGI Nova-Seed", "NOVA-SEED") Ownable(owner_) {}

    /// @notice Mint a new Nova Seed to the requested address.
    /// @param to Recipient that will receive the seed.
    /// @param tokenURI_ Full token metadata URI.
    /// @return tokenId Newly minted token identifier.
    function mintSeed(address to, string memory tokenURI_)
        external
        onlyOwner
        whenNotPaused
        returns (uint256 tokenId)
    {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _tokenURIs[tokenId] = tokenURI_;
        emit SeedMinted(tokenId, to, tokenURI_);
    }

    /// @notice Update metadata URI for an existing seed.
    /// @param tokenId Token identifier whose metadata should be updated.
    /// @param tokenURI_ New metadata URI.
    function updateSeedURI(uint256 tokenId, string memory tokenURI_) external onlyOwner {
        if (_ownerOf(tokenId) == address(0)) {
            revert SeedDoesNotExist(tokenId);
        }
        _tokenURIs[tokenId] = tokenURI_;
        emit SeedURIUpdated(tokenId, tokenURI_);
    }

    /// @notice Configure a base URI prefix used for all seeds.
    /// @dev Setting a base URI does not overwrite explicit per-token URIs.
    /// @param baseUri_ New base URI prefix.
    function setBaseURI(string calldata baseUri_) external onlyOwner {
        _baseUri = baseUri_;
        emit BaseUriUpdated(baseUri_);
    }

    /// @notice Burn an existing seed token.
    /// @param tokenId Token identifier to destroy.
    function burn(uint256 tokenId) external onlyOwner {
        if (_ownerOf(tokenId) == address(0)) {
            revert SeedDoesNotExist(tokenId);
        }
        _burn(tokenId);
        delete _tokenURIs[tokenId];
        emit SeedBurned(tokenId);
    }

    /// @notice Pause all token transfers and minting.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume token transfers and minting.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @inheritdoc ERC721
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) {
            revert SeedDoesNotExist(tokenId);
        }

        string memory explicitUri = _tokenURIs[tokenId];
        if (bytes(explicitUri).length > 0) {
            return explicitUri;
        }
        return string.concat(_baseUri, _toString(tokenId));
    }

    /// @inheritdoc ERC721Pausable
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Pausable)
        whenNotPaused
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    /// @inheritdoc ERC721
    function supportsInterface(bytes4 interfaceId) public view override(ERC721) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Convert a uint256 to string without importing additional helpers.
    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
