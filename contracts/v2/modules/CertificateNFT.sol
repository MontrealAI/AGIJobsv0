// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ICertificateNFT} from "../interfaces/ICertificateNFT.sol";

/// @title CertificateNFT (module)
/// @notice ERC721 certificate minted upon successful job completion.
/// @dev Only participants bear any tax obligations; the contract holds no
///      ether and rejects unsolicited transfers.
contract CertificateNFT is ERC721, Ownable, ICertificateNFT {
    using Strings for uint256;
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    error ZeroAddress();
    error InvalidBaseURI();
    error BaseURIAlreadySet();

    address public jobRegistry;
    mapping(uint256 => bytes32) public tokenHashes;
    string private _baseURIStorage;
    bool private _baseURISet;

    uint256 public constant MAX_BATCH_MINT = 20;

    event JobRegistryUpdated(address registry);
    event BaseURISet(string baseURI);

    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {}

    modifier onlyJobRegistry() {
        require(msg.sender == jobRegistry, "only JobRegistry");
        _;
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    function setJobRegistry(address registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        if (_baseURISet) revert BaseURIAlreadySet();
        bytes memory uriBytes = bytes(baseURI_);
        if (uriBytes.length < 7) revert InvalidBaseURI();
        if (
            uriBytes[0] != 'i' ||
            uriBytes[1] != 'p' ||
            uriBytes[2] != 'f' ||
            uriBytes[3] != 's' ||
            uriBytes[4] != ':' ||
            uriBytes[5] != '/' ||
            uriBytes[6] != '/'
        ) {
            revert InvalidBaseURI();
        }
        _baseURIStorage = baseURI_;
        _baseURISet = true;
        emit BaseURISet(baseURI_);
    }

    function mint(
        address to,
        uint256 jobId,
        bytes32 uriHash
    ) external onlyJobRegistry returns (uint256 tokenId) {
        tokenId = _mintCertificate(to, jobId, uriHash);
    }

    function batchMint(
        address[] calldata recipients,
        uint256[] calldata jobIds,
        bytes32[] calldata uriHashes
    ) external onlyJobRegistry returns (uint256[] memory tokenIds) {
        uint256 length = recipients.length;
        if (length == 0) revert EmptyBatch();
        if (length != jobIds.length || length != uriHashes.length) {
            revert ArrayLengthMismatch();
        }
        if (length > MAX_BATCH_MINT) revert BatchMintLimitExceeded(length, MAX_BATCH_MINT);
        tokenIds = new uint256[](length);
        for (uint256 i; i < length;) {
            tokenIds[i] = _mintCertificate(recipients[i], jobIds[i], uriHashes[i]);
            unchecked {
                ++i;
            }
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (!_baseURISet) revert BaseURIUnset();
        return string.concat(_baseURIStorage, Strings.toHexString(uint256(tokenHashes[tokenId]), 32));
    }

    /// @notice Confirms this NFT module and owner remain tax neutral.
    /// @return Always true, indicating no tax liabilities can accrue.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers to keep the contract and its owner
    /// free of taxable assets.
    receive() external payable {
        revert("CertificateNFT: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("CertificateNFT: no ether");
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIStorage;
    }

    function _mintCertificate(
        address to,
        uint256 jobId,
        bytes32 uriHash
    ) private returns (uint256 tokenId) {
        if (!_baseURISet) revert BaseURIUnset();
        if (to == address(0)) revert ZeroAddress();
        if (uriHash == bytes32(0)) revert EmptyURI();
        tokenId = jobId;
        if (_ownerOf(tokenId) != address(0)) revert CertificateAlreadyMinted(jobId);
        _safeMint(to, tokenId);
        tokenHashes[tokenId] = uriHash;
        emit CertificateMinted(to, jobId, uriHash);
    }
}

