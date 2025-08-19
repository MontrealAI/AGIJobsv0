// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IStakeManager {
    function releaseJobFunds(bytes32 jobId, address to, uint256 amount) external;
}

/// @title JobNFT
/// @notice ERC721 token representing jobs with simple marketplace mechanics.
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

    /// @notice ERC20 token used for purchases ($AGIALPHA).
    IERC20 public immutable agiAlpha;

    /// @notice Optional StakeManager used to release escrowed job funds.
    IStakeManager public stakeManager;

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

    event BaseURIUpdated(string newURI);
    event JobRegistryUpdated(address registry);
    event NFTIssued(address indexed to, uint256 indexed jobId);
    event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event NFTPurchased(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event NFTDelisted(uint256 indexed tokenId);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @param agiAlpha_ Address of the $AGIALPHA ERC20 token.
    constructor(address agiAlpha_) ERC721("Job", "JOB") Ownable(msg.sender) {
        agiAlpha = IERC20(agiAlpha_);
    }

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

    /// @notice Set the base URI for all tokens.
    function setBaseURI(string calldata uri) external onlyOwner {
        baseTokenURI = uri;
        emit BaseURIUpdated(uri);
    }

    /// @notice Configure StakeManager for escrow-based purchases.
    function setStakeManager(address manager) external onlyOwner {
        stakeManager = IStakeManager(manager);
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
        Listing storage listing = listings[tokenId];
        require(!listing.active, "listed");

        listing.seller = msg.sender;
        listing.price = price;
        listing.active = true;

        emit NFTListed(tokenId, msg.sender, price);
    }

    /// @notice Purchase a listed token using $AGIALPHA.
    /// @param tokenId Token being purchased.
    /// @param jobId Optional job identifier to release funds from StakeManager.
    function purchase(uint256 tokenId, bytes32 jobId) external {
        Listing storage listing = listings[tokenId];
        require(listing.active, "not listed");
        address seller = listing.seller;
        require(seller != msg.sender, "self");
        uint256 price = listing.price;

        delete listings[tokenId];

        if (jobId != bytes32(0) && address(stakeManager) != address(0)) {
            stakeManager.releaseJobFunds(jobId, seller, price);
        } else {
            agiAlpha.safeTransferFrom(msg.sender, seller, price);
        }
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
}

