// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {StakeManager} from "./StakeManager.sol";

/// @title CertificateNFT
/// @notice ERC721 certificate minted upon successful job completion with a
///         lightweight marketplace for peer to peer trades.
contract CertificateNFT is ERC721, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    /// @dev Reverts when a zero address is supplied where non-zero is required.
    error ZeroAddress();

    /// @dev Reverts when caller is not the authorised JobRegistry.
    error NotJobRegistry(address caller);

    /// @dev Reverts when attempting to mint more than once for the same job.
    error CertificateAlreadyMinted(uint256 jobId);

    /// @dev Reverts when an empty metadata URI is supplied.
    error EmptyURI();

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    address public jobRegistry;
    mapping(uint256 => bytes32) public tokenHashes;

    /// @notice StakeManager providing the ERC20 token used for payments.
    StakeManager public stakeManager;

    /// @notice Listing information for marketplace functionality.
    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    mapping(uint256 => Listing) public listings;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event JobRegistryUpdated(address registry);
    event StakeManagerUpdated(address manager);
    event CertificateMinted(address indexed to, uint256 indexed jobId, string uri);
    event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event NFTPurchased(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event NFTDelisted(uint256 indexed tokenId);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor() ERC721("Cert", "CERT") Ownable(msg.sender) {}

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyJobRegistry() {
        if (msg.sender != jobRegistry) {
            revert NotJobRegistry(msg.sender);
        }
        _;
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------

    /// @notice Configure the authorised JobRegistry.
    function setJobRegistry(address registry) external onlyOwner {
        if (registry == address(0)) revert ZeroAddress();
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    /// @notice Set the StakeManager used to transfer the ERC20 token.
    function setStakeManager(address manager) external onlyOwner {
        if (manager == address(0)) revert ZeroAddress();
        stakeManager = StakeManager(payable(manager));
        emit StakeManagerUpdated(manager);
    }

    // ---------------------------------------------------------------------
    // Minting
    // ---------------------------------------------------------------------

    /// @notice Mint a new certificate to `to` for `jobId`.
    /// @dev Only callable by the configured JobRegistry.
    function mint(
        address to,
        uint256 jobId,
        string calldata uri
    ) external onlyJobRegistry returns (uint256 tokenId) {
        if (bytes(uri).length == 0) revert EmptyURI();
        if (to == address(0)) revert ZeroAddress();
        tokenId = jobId;
        if (_ownerOf(tokenId) != address(0)) {
            revert CertificateAlreadyMinted(jobId);
        }
        _safeMint(to, tokenId);
        tokenHashes[tokenId] = keccak256(bytes(uri));
        emit CertificateMinted(to, jobId, uri);
    }

    // ---------------------------------------------------------------------
    // Marketplace
    // ---------------------------------------------------------------------

    /// @notice List a certificate for sale at a given `price`.
    function list(uint256 tokenId, uint256 price) external {
        require(ownerOf(tokenId) == msg.sender, "owner");
        require(price > 0, "price");
        Listing storage listing = listings[tokenId];
        require(!listing.active, "listed");

        listing.seller = msg.sender;
        listing.price = price;
        listing.active = true;

        emit NFTListed(tokenId, msg.sender, price);
    }

    /// @notice Purchase a listed certificate using the StakeManager's token.
    function purchase(uint256 tokenId) external nonReentrant {
        Listing storage listing = listings[tokenId];
        require(listing.active, "not listed");
        address seller = listing.seller;
        require(seller != msg.sender, "self");

        IERC20 token = stakeManager.token();
        uint256 price = listing.price;
        require(token.allowance(msg.sender, address(this)) >= price, "allowance");

        delete listings[tokenId];

        token.safeTransferFrom(msg.sender, seller, price);
        _safeTransfer(seller, msg.sender, tokenId, "");

        emit NFTPurchased(tokenId, msg.sender, price);
    }

    /// @notice Remove an active listing.
    function delist(uint256 tokenId) external {
        Listing storage listing = listings[tokenId];
        require(listing.active, "not listed");
        require(listing.seller == msg.sender, "owner");
        delete listings[tokenId];
        emit NFTDelisted(tokenId);
    }

    // ---------------------------------------------------------------------
    // Metadata
    // ---------------------------------------------------------------------

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        revert("Off-chain URI");
    }

    // ---------------------------------------------------------------------
    // Tax neutrality helpers
    // ---------------------------------------------------------------------

    /// @notice Confirms the contract and owner are tax-exempt.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------------

    receive() external payable {
        revert("CertificateNFT: no ether");
    }

    fallback() external payable {
        revert("CertificateNFT: no ether");
    }
}

