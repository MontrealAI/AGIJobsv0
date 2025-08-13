// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title JobNFT
/// @notice Minimal ERC721 token for representing jobs.
/// @dev Minting and burning are restricted to the JobRegistry contract.
contract JobNFT is ERC721, Ownable {
    string private baseTokenURI;
    address public jobRegistry;
    uint256 public nextTokenId;
    mapping(uint256 => string) private _tokenURIs;

    event BaseURIUpdated(string newURI);
    event JobRegistryUpdated(address registry);

    constructor() ERC721("Job", "JOB") Ownable(msg.sender) {}

    modifier onlyJobRegistry() {
        require(msg.sender == jobRegistry, "only JobRegistry");
        _;
    }

    /// @notice Set the base URI for all tokens.
    function setBaseURI(string calldata uri) external onlyOwner {
        baseTokenURI = uri;
        emit BaseURIUpdated(uri);
    }

    /// @notice Configure the authorized JobRegistry.
    function setJobRegistry(address registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    /// @notice Mint a new token to `to` with optional `uri`.
    /// @dev Only callable by the JobRegistry.
    function mint(address to, string calldata uri)
        external
        onlyJobRegistry
        returns (uint256 tokenId)
    {
        tokenId = ++nextTokenId;
        _safeMint(to, tokenId);
        if (bytes(uri).length != 0) {
            _tokenURIs[tokenId] = uri;
        }
    }

    /// @notice Burn a token, invalidating the associated job.
    /// @dev Only callable by the JobRegistry.
    function burn(uint256 tokenId) external onlyJobRegistry {
        _burn(tokenId);
        if (bytes(_tokenURIs[tokenId]).length != 0) {
            delete _tokenURIs[tokenId];
        }
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        string memory custom = _tokenURIs[tokenId];
        if (bytes(custom).length != 0) {
            string memory base = _baseURI();
            if (bytes(base).length != 0) {
                return string(abi.encodePacked(base, custom));
            }
            return custom;
        }
        return super.tokenURI(tokenId);
    }
}

