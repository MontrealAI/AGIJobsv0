// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CertificateNFT
/// @notice ERC721 certificate minted upon successful job completion.
contract CertificateNFT is ERC721, Ownable {
    string private baseTokenURI;
    address public jobRegistry;
    mapping(uint256 => string) private _tokenURIs;

    event BaseURIUpdated(string newURI);
    event JobRegistryUpdated(address registry);
    /// @notice Emitted when a certificate is minted.
    event CertificateMinted(address indexed to, uint256 indexed jobId);

    constructor() ERC721("Cert", "CERT") Ownable(msg.sender) {}

    modifier onlyJobRegistry() {
        require(msg.sender == jobRegistry, "only JobRegistry");
        _;
    }

    /// @notice Update the base token URI.
    function setBaseURI(string calldata uri) external onlyOwner {
        baseTokenURI = uri;
        emit BaseURIUpdated(uri);
    }

    /// @notice Configure the authorized JobRegistry.
    function setJobRegistry(address registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    /// @notice Mint a new certificate to `to` for `jobId`.
    /// @dev Only callable by the configured JobRegistry.
    function mintCertificate(
        address to,
        uint256 jobId,
        string calldata uri
    ) external onlyJobRegistry returns (uint256 tokenId) {
        tokenId = jobId;
        _safeMint(to, tokenId);
        if (bytes(uri).length != 0) {
            _tokenURIs[tokenId] = uri;
        }
        emit CertificateMinted(to, tokenId);
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

    /// @notice Confirms the contract and owner are tax-exempt.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    receive() external payable {
        revert("CertificateNFT: no ether");
    }

    fallback() external payable {
        revert("CertificateNFT: no ether");
    }
}

