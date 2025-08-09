// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICertificateNFT} from "./interfaces/ICertificateNFT.sol";

/// @title CertificateNFT
/// @notice ERC721 certificate minted upon successful job completion.
contract CertificateNFT is ERC721, Ownable, ICertificateNFT {
    address public jobRegistry;
    string private baseTokenURI;
    mapping(uint256 => string) private _tokenURIs;

    event BaseURIUpdated(string newURI);
    event JobRegistryUpdated(address registry);

    constructor(string memory name_, string memory symbol_, address owner_)
        ERC721(name_, symbol_)
        Ownable(owner_)
    {}

    modifier onlyJobRegistry() {
        if (msg.sender != jobRegistry) revert NotJobRegistry(msg.sender);
        _;
    }

    function setJobRegistry(address registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        baseTokenURI = uri;
        emit BaseURIUpdated(uri);
    }

    function mint(
        address to,
        uint256 jobId,
        string calldata uri
    ) external onlyJobRegistry returns (uint256 tokenId) {
        if (bytes(uri).length == 0) revert EmptyURI();
        tokenId = jobId;
        if (_ownerOf(tokenId) != address(0)) revert CertificateAlreadyMinted(jobId);
        _safeMint(to, tokenId);
        _tokenURIs[tokenId] = uri;
        emit CertificateMinted(to, jobId);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory custom = _tokenURIs[tokenId];
        string memory base = _baseURI();
        if (bytes(base).length != 0) {
            return string.concat(base, custom);
        }
        return custom;
    }
}

