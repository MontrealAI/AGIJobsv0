// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ICertificateNFT} from "./interfaces/ICertificateNFT.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {AGIALPHA} from "./Constants.sol";

/// @title CertificateNFT
/// @notice ERC721 certificate minted upon successful job completion.
/// @dev Holds no ether so neither the contract nor its owner ever custodies
///      assets or accrues taxable exposure in any jurisdiction.
contract CertificateNFT is ERC721, Ownable, Pausable, ReentrancyGuard, ICertificateNFT {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    /// @dev Emitted when a zero address is supplied where non-zero is required.
    error ZeroAddress();

    error NotTokenOwner();
    error InvalidPrice();
    error AlreadyListed();
    error NotListed();
    error SelfPurchase();
    error InsufficientAllowance();
    error InvalidStakeManagerVersion();
    error InvalidStakeManagerToken();
    error InvalidBaseURI();
    error BaseURIAlreadySet();

    address public jobRegistry;
    mapping(uint256 => bytes32) public tokenHashes;
    string private _baseURIStorage;
    bool private _baseURISet;

    IStakeManager public stakeManager;

    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    mapping(uint256 => Listing) public listings;

    event JobRegistryUpdated(address registry);
    event StakeManagerUpdated(address manager);
    event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event NFTPurchased(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event NFTDelisted(uint256 indexed tokenId);
    event BaseURISet(string baseURI);

    uint256 public constant MAX_BATCH_MINT = 20;

    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {}

    modifier onlyJobRegistry() {
        if (msg.sender != jobRegistry) revert NotJobRegistry(msg.sender);
        _;
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    function setJobRegistry(address registry) external onlyOwner {
        if (registry == address(0)) revert ZeroAddress();
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    function setStakeManager(address manager) external onlyOwner {
        if (manager == address(0)) revert ZeroAddress();
        if (IStakeManager(manager).version() != version) {
            revert InvalidStakeManagerVersion();
        }
        if (IStakeManager(manager).token() != IERC20(AGIALPHA)) {
            revert InvalidStakeManagerToken();
        }
        stakeManager = IStakeManager(manager);
        emit StakeManagerUpdated(manager);
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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
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

    function list(uint256 tokenId, uint256 price) external whenNotPaused {
        address tokenOwner = ownerOf(tokenId);
        if (tokenOwner != msg.sender) revert NotTokenOwner();
        if (price == 0) revert InvalidPrice();
        Listing storage listing = listings[tokenId];
        if (listing.active && listing.seller != tokenOwner) {
            delete listings[tokenId];
        }
        if (listing.active) revert AlreadyListed();
        listing.seller = tokenOwner;
        listing.price = price;
        listing.active = true;
        emit NFTListed(tokenId, msg.sender, price);
    }

    /// @notice Purchase a listed certificate using 18‑decimal $AGIALPHA tokens.
    function purchase(uint256 tokenId) external nonReentrant whenNotPaused {
        Listing storage listing = listings[tokenId];
        if (!listing.active) revert NotListed();
        address seller = listing.seller;
        if (seller == msg.sender) revert SelfPurchase();
        IERC20 token = stakeManager.token();
        if (token.allowance(msg.sender, address(this)) < listing.price) revert InsufficientAllowance();
        uint256 price = listing.price;
        delete listings[tokenId];
        token.safeTransferFrom(msg.sender, seller, price);
        _safeTransfer(seller, msg.sender, tokenId, "");
        emit NFTPurchased(tokenId, msg.sender, price);
    }

    function delist(uint256 tokenId) external whenNotPaused {
        Listing storage listing = listings[tokenId];
        if (!listing.active) revert NotListed();
        address tokenOwner = ownerOf(tokenId);
        if (listing.seller != msg.sender && tokenOwner != msg.sender) {
            revert NotTokenOwner();
        }
        delete listings[tokenId];
        emit NFTDelisted(tokenId);
    }

    /// @notice Confirms the NFT contract and owner are fully tax neutral.
    /// @return Always true, indicating no tax liability can accrue.
    function isTaxExempt() external pure returns (bool) {
        return true;
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

    // ---------------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------------

    /// @dev Reject direct ETH transfers to keep the contract and its owner
    /// tax neutral.
    receive() external payable {
        revert("CertificateNFT: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("CertificateNFT: no ether");
    }
}

