// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICertificateNFT} from "./interfaces/ICertificateNFT.sol";

/// @title CertificateNFT
/// @notice ERC721 certificate minted upon successful job completion.
contract CertificateNFT is ERC721, Ownable, ICertificateNFT {
    address public jobRegistry;
    mapping(uint256 => string) private _tokenURIs;

    constructor(string memory name_, string memory symbol_, address owner_)
        ERC721(name_, symbol_)
        Ownable(owner_)
    {}

    modifier onlyJobRegistry() {
        require(msg.sender == jobRegistry, "only JobRegistry");
        _;
    }

    function setJobRegistry(address registry) external onlyOwner {
        jobRegistry = registry;
    }

    function mint(
        address to,
        uint256 jobId,
        string calldata uri
    ) external onlyJobRegistry returns (uint256 tokenId) {
        tokenId = jobId;
        _safeMint(to, tokenId);
        if (bytes(uri).length != 0) {
            _tokenURIs[tokenId] = uri;
        }
        emit CertificateMinted(to, jobId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }
}

