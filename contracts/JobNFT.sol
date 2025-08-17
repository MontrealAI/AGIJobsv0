// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IStakeManager {
    function token() external view returns (IERC20);
}

/// @title JobNFT
/// @notice Minimal ERC721 token for representing jobs with a simple marketplace.
/// @dev Minting and burning are restricted to the JobRegistry contract.
contract JobNFT is ERC721, Ownable {
    using SafeERC20 for IERC20;

    string private baseTokenURI;
    address public jobRegistry;
    IStakeManager public stakeManager;
    mapping(uint256 => string) private _tokenURIs;

    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    mapping(uint256 => Listing) public listings;

    event BaseURIUpdated(string newURI);
    event JobRegistryUpdated(address registry);
    event StakeManagerUpdated(address manager);
    event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event NFTPurchased(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event NFTDelisted(uint256 indexed tokenId);

    constructor() ERC721("Job", "JOB") Ownable(msg.sender) {}

    modifier onlyJobRegistry() {
        require(msg.sender == jobRegistry, "only JobRegistry");
        _;
    }

    /// @notice Set the base URI for all tokens.
    function setBaseURI(string calldata uri) external onlyOwner {
        baseTokenURI = uri;
        emit BaseURIUpdated(uri);
    }

    /// @notice Configure the authorized JobRegistry.
    function setJobRegistry(address registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    /// @notice Configure the StakeManager used for marketplace payments.
    function setStakeManager(address manager) external onlyOwner {
        stakeManager = IStakeManager(manager);
        emit StakeManagerUpdated(manager);
    }

    /// @notice Mint a new token to `to` for the provided `jobId` with optional `uri`.
    /// @dev Only callable by the JobRegistry. The tokenId matches the jobId.
    function mint(
        address to,
        uint256 jobId,
        string calldata uri
    ) external onlyJobRegistry returns (uint256 tokenId) {
        tokenId = jobId;
        require(_ownerOf(tokenId) == address(0), "existing");
        _safeMint(to, tokenId);
        if (bytes(uri).length != 0) {
            _tokenURIs[tokenId] = uri;
        }
    }

    /// @notice Burn a token, invalidating the associated job.
    /// @dev Only callable by the JobRegistry.
    function burn(uint256 tokenId) external onlyJobRegistry {
        _burn(tokenId);
        if (bytes(_tokenURIs[tokenId]).length != 0) {
            delete _tokenURIs[tokenId];
        }
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

    /// @notice List an NFT for sale at `price` using the StakeManager token.
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

    /// @notice Purchase a listed NFT using the StakeManager's staking token.
    function purchase(uint256 tokenId) external {
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

    /// @notice Remove a listed NFT from the marketplace.
    function delist(uint256 tokenId) external {
        Listing storage listing = listings[tokenId];
        require(listing.active, "not listed");
        require(listing.seller == msg.sender, "owner");
        delete listings[tokenId];
        emit NFTDelisted(tokenId);
    }
}

