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
    uint256 public constant MAX_BATCH_MINT = 32;

    address public jobRegistry;
    mapping(uint256 => bytes32) public tokenHashes;
    string private _baseTokenURI;
    bool private _baseURISet;
    mapping(uint256 => bool) private _validatedWithBase;

    event JobRegistryUpdated(address registry);

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
        if (!_isValidIPFSURI(baseURI_)) revert InvalidBaseURI();
        _baseTokenURI = baseURI_;
        _baseURISet = true;
        emit BaseURISet(baseURI_);
    }

    function _isValidIPFSURI(string calldata baseURI_) private pure returns (bool) {
        bytes memory data = bytes(baseURI_);
        bytes memory prefix = bytes("ipfs://");
        if (data.length <= prefix.length) {
            return false;
        }
        for (uint256 i; i < prefix.length; ) {
            if (data[i] != prefix[i]) {
                return false;
            }
            unchecked {
                ++i;
            }
        }
        if (data[data.length - 1] != 0x2f) {
            return false;
        }
        return true;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function _validateHash(uint256 tokenId, bytes32 uriHash) private view {
        if (!_baseURISet) {
            return;
        }
        string memory uri = string.concat(_baseTokenURI, tokenId.toString());
        bytes32 computed = keccak256(bytes(uri));
        if (computed != uriHash) {
            revert MetadataHashMismatch(tokenId, uriHash, computed);
        }
    }

    function mint(
        address to,
        uint256 jobId,
        bytes32 uriHash
    ) external onlyJobRegistry returns (uint256 tokenId) {
        if (uriHash == bytes32(0)) revert EmptyURI();
        tokenId = jobId;
        _validateHash(tokenId, uriHash);
        _safeMint(to, tokenId);
        tokenHashes[tokenId] = uriHash;
        if (_baseURISet) {
            _validatedWithBase[tokenId] = true;
        }
        emit CertificateMinted(to, jobId, uriHash);
    }

    function mintBatch(
        address[] calldata recipients,
        uint256[] calldata jobIds,
        bytes32[] calldata uriHashes
    ) external onlyJobRegistry {
        uint256 length = recipients.length;
        if (length == 0) return;
        if (length != jobIds.length || length != uriHashes.length) {
            revert ArrayLengthMismatch();
        }
        if (length > MAX_BATCH_MINT) revert BatchSizeTooLarge(length, MAX_BATCH_MINT);
        for (uint256 i; i < length; ) {
            uint256 tokenId = jobIds[i];
            bytes32 uriHash = uriHashes[i];
            if (uriHash == bytes32(0)) revert EmptyURI();
            _validateHash(tokenId, uriHash);
            _safeMint(recipients[i], tokenId);
            tokenHashes[tokenId] = uriHash;
            if (_baseURISet) {
                _validatedWithBase[tokenId] = true;
            }
            emit CertificateMinted(recipients[i], tokenId, uriHash);
            unchecked {
                ++i;
            }
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (!_baseURISet) revert BaseURINotSet();
        string memory uri = super.tokenURI(tokenId);
        if (_validatedWithBase[tokenId]) {
            bytes32 expected = tokenHashes[tokenId];
            bytes32 actual = keccak256(bytes(uri));
            if (expected != actual) {
                revert MetadataHashMismatch(tokenId, expected, actual);
            }
        }
        return uri;
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
}

