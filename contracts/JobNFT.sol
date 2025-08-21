// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StakeManager} from "./StakeManager.sol";

/// @title JobNFT
/// @notice ERC721 token representing jobs with simple marketplace mechanics.
/// Owner can authorize a JobRegistry for minting via {setJobRegistry} and
/// update metadata with {setBaseURI}. The authorized JobRegistry calls
/// {mint} to create tokens. A lightweight marketplace allows holders to
/// list, purchase, and delist NFTs using $AGIALPHA while emitting
/// {NFTListed}, {NFTPurchased}, and {NFTDelisted} events.
/// @dev Minting and burning are restricted to the JobRegistry contract.
contract JobNFT is ERC721, Ownable {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Address of the JobRegistry allowed to mint/burn.
    address public jobRegistry;

    /// @notice Base URI for token metadata.
    string private baseTokenURI;

    /// @notice StakeManager providing the $AGIALPHA token.
    StakeManager public stakeManager;

    /// @notice Listing information for marketplace functionality.
    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    mapping(uint256 => Listing) public listings;

    /// @notice Price granularity enforcing 6-decimal units for $AGIALPHA.
    uint256 private constant PRICE_UNIT = 1e6;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event BaseURIUpdated(string newURI);
    event JobRegistryUpdated(address registry);
    event StakeManagerUpdated(address manager);
    /// @notice Emitted when a new NFT is issued.
    event NFTIssued(address indexed to, uint256 indexed jobId);
    event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event NFTPurchased(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event NFTDelisted(uint256 indexed tokenId);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor() ERC721("Job", "JOB") Ownable(msg.sender) {}

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    /// @notice Restricts function to the configured JobRegistry.
    modifier onlyJobRegistry() {
        require(msg.sender == jobRegistry, "only JobRegistry");
        _;
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------

    /// @notice Configure the authorized JobRegistry.
    function setJobRegistry(address registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    /// @notice Set the StakeManager used to transfer $AGIALPHA.
    function setStakeManager(address manager) external onlyOwner {
        stakeManager = StakeManager(payable(manager));
        emit StakeManagerUpdated(manager);
    }

    /// @notice Set the base URI for all tokens.
    function setBaseURI(string calldata uri) external onlyOwner {
        baseTokenURI = uri;
        emit BaseURIUpdated(uri);
    }

    // ---------------------------------------------------------------------
    // Mint/Burn
    // ---------------------------------------------------------------------

    /// @notice Mint a new token to `to` using `jobId` as the token ID.
    /// @dev Only callable by the JobRegistry.
    function mint(address to, uint256 jobId) external onlyJobRegistry returns (uint256 tokenId) {
        tokenId = jobId;
        require(_ownerOf(tokenId) == address(0), "exists");
        _safeMint(to, tokenId);
        emit NFTIssued(to, tokenId);
    }

    /// @notice Burn a token, invalidating the associated job.
    /// @dev Only callable by the JobRegistry. Active listings are removed.
    function burn(uint256 tokenId) external onlyJobRegistry {
        _burn(tokenId);
        if (listings[tokenId].active) {
            delete listings[tokenId];
        }
    }

    /// @dev Override for base URI handling.
    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    // ---------------------------------------------------------------------
    // Marketplace
    // ---------------------------------------------------------------------

    /// @notice List a token for sale at a given `price`.
    function list(uint256 tokenId, uint256 price) external {
        require(ownerOf(tokenId) == msg.sender, "owner");
        require(price > 0, "price");
        require(price % PRICE_UNIT == 0, "decimals");
        Listing storage listing = listings[tokenId];
        require(!listing.active, "listed");

        listing.seller = msg.sender;
        listing.price = price;
        listing.active = true;

        emit NFTListed(tokenId, msg.sender, price);
    }

    /// @notice Purchase a listed token using $AGIALPHA.
    function purchase(uint256 tokenId) external {
        Listing storage listing = listings[tokenId];
        require(listing.active, "not listed");
        address seller = listing.seller;
        require(seller != msg.sender, "self");
        uint256 price = listing.price;

        require(price > 0, "price");
        require(ownerOf(tokenId) == seller, "owner");

        IERC20 token = stakeManager.token();
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
        require(ownerOf(tokenId) == msg.sender, "owner");

        delete listings[tokenId];

        emit NFTDelisted(tokenId);
    }
}

