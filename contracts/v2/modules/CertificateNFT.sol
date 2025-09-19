// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICertificateNFT} from "../interfaces/ICertificateNFT.sol";

/// @title CertificateNFT (module)
/// @notice ERC721 certificate minted upon successful job completion.
/// @dev Only participants bear any tax obligations; the contract holds no
///      ether and rejects unsolicited transfers.
contract CertificateNFT is ERC721, Ownable, ICertificateNFT {
    uint256 public constant version = 2;
    uint256 public constant MAX_BATCH_MINT = 25;

    bytes private constant IPFS_PREFIX = bytes("ipfs://");

    error ZeroAddress();
    error InvalidBaseURI();

    address public jobRegistry;
    mapping(uint256 => bytes32) public tokenHashes;

    string private _baseTokenURI;

    event JobRegistryUpdated(address registry);
    event BaseURISet(string baseURI);

    constructor(string memory name_, string memory symbol_, string memory baseURI_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {
        _setBaseURI(baseURI_);
    }

    modifier onlyJobRegistry() {
        if (msg.sender != jobRegistry) revert NotJobRegistry(msg.sender);
        _;
    }

    function setJobRegistry(address registry) external onlyOwner {
        if (registry == address(0)) revert ZeroAddress();
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    function mint(
        address to,
        uint256 jobId,
        bytes32 uriHash
    ) external onlyJobRegistry returns (uint256 tokenId) {
        tokenId = _mintCertificate(to, jobId, uriHash);
    }

    function mintBatch(ICertificateNFT.MintInput[] calldata mints)
        external
        onlyJobRegistry
        returns (uint256[] memory tokenIds)
    {
        uint256 length = mints.length;
        if (length == 0) revert EmptyMintBatch();
        if (length > MAX_BATCH_MINT) revert MintBatchTooLarge(length, MAX_BATCH_MINT);

        tokenIds = new uint256[](length);

        for (uint256 i = 0; i < length; ) {
            ICertificateNFT.MintInput calldata mintInput = mints[i];
            tokenIds[i] = _mintCertificate(mintInput.to, mintInput.jobId, mintInput.uriHash);
            unchecked {
                ++i;
            }
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return super.tokenURI(tokenId);
    }

    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    receive() external payable {
        revert("CertificateNFT: no ether");
    }

    fallback() external payable {
        revert("CertificateNFT: no ether");
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function _mintCertificate(
        address to,
        uint256 jobId,
        bytes32 uriHash
    ) internal returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        if (uriHash == bytes32(0)) revert EmptyURI();

        tokenId = jobId;
        if (_ownerOf(tokenId) != address(0)) revert CertificateAlreadyMinted(jobId);

        _safeMint(to, tokenId);
        tokenHashes[tokenId] = uriHash;
        emit CertificateMinted(to, tokenId, uriHash);
    }

    function _setBaseURI(string memory baseURI_) internal {
        bytes memory uriBytes = bytes(baseURI_);
        if (uriBytes.length <= IPFS_PREFIX.length) revert InvalidBaseURI();
        for (uint256 i = 0; i < IPFS_PREFIX.length; ++i) {
            if (uriBytes[i] != IPFS_PREFIX[i]) revert InvalidBaseURI();
        }
        if (uriBytes[uriBytes.length - 1] != "/") revert InvalidBaseURI();

        _baseTokenURI = baseURI_;
        emit BaseURISet(baseURI_);
    }
}
