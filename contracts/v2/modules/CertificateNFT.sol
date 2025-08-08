// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICertificateNFT} from "../interfaces/ICertificateNFT.sol";

/// @title CertificateNFT (module)
/// @notice ERC721 certificate minted upon successful job completion.
contract CertificateNFT is ERC721, Ownable, ICertificateNFT {
    string private baseTokenURI;
    address public jobRegistry;
    mapping(uint256 => string) private _tokenURIs;

    event JobRegistryUpdated(address registry);
    event TokenURIUpdated(uint256 indexed tokenId, string uri);

    constructor(string memory name_, string memory symbol_, address owner_)
        ERC721(name_, symbol_)
        Ownable(owner_)
    {}

    modifier onlyJobRegistry() {
        require(msg.sender == jobRegistry, "only JobRegistry");
        _;
    }

    /// @notice Owner function to update metadata base URI.
    function setBaseURI(string calldata uri) external onlyOwner {
        baseTokenURI = uri;
        emit BaseURIUpdated(uri);
    }

    /// @notice Owner function to set JobRegistry address permitted to mint certificates.
    function setJobRegistry(address registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    /// @notice Mint a certificate NFT for a completed job.
    /// @param to Recipient of the certificate.
    /// @param jobId Identifier tying certificate to job.
    /// @param uri Optional metadata URI overriding base.
    function mintCertificate(
        address to,
        uint256 jobId,
        string calldata uri
    ) external onlyJobRegistry returns (uint256 tokenId) {
        tokenId = jobId;
        _safeMint(to, tokenId);
        if (bytes(uri).length != 0) {
            _tokenURIs[tokenId] = uri;
            emit TokenURIUpdated(tokenId, uri);
        }
        emit CertificateMinted(to, jobId);
    }

    /// @notice Owner function to update an existing token's metadata URI.
    /// @param tokenId The token to update.
    /// @param uri New metadata URI.
    function updateTokenURI(uint256 tokenId, string calldata uri) external onlyOwner {
        _requireOwned(tokenId);
        _tokenURIs[tokenId] = uri;
        emit TokenURIUpdated(tokenId, uri);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        string memory custom = _tokenURIs[tokenId];
        if (bytes(custom).length != 0) {
            return custom;
        }
        return super.tokenURI(tokenId);
    }
}

