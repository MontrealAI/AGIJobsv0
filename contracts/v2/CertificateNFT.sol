// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {StakeManager} from "./StakeManager.sol";
import {ICertificateNFT} from "./interfaces/ICertificateNFT.sol";

/// @title CertificateNFT
/// @notice ERC721 certificate minted upon successful job completion.
/// @dev Holds no ether so neither the contract nor its owner ever custodies
///      assets or accrues taxable exposure in any jurisdiction.
contract CertificateNFT is ERC721, Ownable, ReentrancyGuard, ICertificateNFT {
    using SafeERC20 for IERC20;

    /// @notice Module version for compatibility checks.
    uint256 public constant version = 1;

    /// @dev Emitted when a zero address is supplied where non-zero is required.
    error ZeroAddress();

    address public jobRegistry;
    mapping(uint256 => bytes32) public tokenHashes;

    StakeManager public stakeManager;

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
        stakeManager = StakeManager(payable(manager));
        emit StakeManagerUpdated(manager);
    }

    function mint(
        address to,
        uint256 jobId,
        bytes32 uriHash
    ) external onlyJobRegistry returns (uint256 tokenId) {
        if (uriHash == bytes32(0)) revert EmptyURI();
        if (to == address(0)) revert ZeroAddress();
        tokenId = jobId;
        if (_ownerOf(tokenId) != address(0)) revert CertificateAlreadyMinted(jobId);
        _safeMint(to, tokenId);
        tokenHashes[tokenId] = uriHash;
        emit CertificateMinted(to, jobId, uriHash);
    }
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        revert("Off-chain URI");
    }

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

    /// @notice Purchase a listed certificate using 6‑decimal $AGIALPHA tokens.
    function purchase(uint256 tokenId) external nonReentrant {
        Listing storage listing = listings[tokenId];
        require(listing.active, "not listed");
        address seller = listing.seller;
        require(seller != msg.sender, "self");
        IERC20 token = stakeManager.token();
        require(
            token.allowance(msg.sender, address(this)) >= listing.price,
            "allowance"
        );
        uint256 price = listing.price;
        delete listings[tokenId];
        token.safeTransferFrom(msg.sender, seller, price);
        _safeTransfer(seller, msg.sender, tokenId, "");
        emit NFTPurchased(tokenId, msg.sender, price);
    }

    function delist(uint256 tokenId) external {
        Listing storage listing = listings[tokenId];
        require(listing.active, "not listed");
        require(listing.seller == msg.sender, "owner");
        delete listings[tokenId];
        emit NFTDelisted(tokenId);
    }

    /// @notice Confirms the NFT contract and owner are fully tax neutral.
    /// @return Always true, indicating no tax liability can accrue.
    function isTaxExempt() external pure returns (bool) {
        return true;
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

