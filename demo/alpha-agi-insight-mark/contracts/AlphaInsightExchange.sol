// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {AlphaInsightNovaSeed} from "./AlphaInsightNovaSeed.sol";

/// @title AlphaInsightExchange
/// @notice Fixed-price foresight exchange for Nova-Seed NFTs with owner-controlled fees and oracle resolution.
contract AlphaInsightExchange is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Listing {
        address seller;
        uint256 price;
        bool active;
        address buyer;
        uint256 listedAt;
    }

    struct ResolutionRecord {
        bool resolved;
        bool fulfilled;
        string notes;
        uint256 resolvedAt;
        address resolver;
    }

    AlphaInsightNovaSeed public immutable novaSeed;
    IERC20 public paymentToken;
    address public treasury;
    uint96 public feeBps;
    address public oracle;
    address private _systemPause;

    mapping(uint256 => Listing) private _listings;
    mapping(uint256 => ResolutionRecord) private _resolutions;

    event ListingCreated(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event ListingPriceUpdated(uint256 indexed tokenId, uint256 oldPrice, uint256 newPrice);
    event ListingForceDelisted(uint256 indexed tokenId, address indexed operator, address indexed recipient);
    event InsightPurchased(uint256 indexed tokenId, address indexed buyer, uint256 price, uint256 fee);
    event ResolutionLogged(uint256 indexed tokenId, bool fulfilled, string notes);
    event TreasuryUpdated(address indexed newTreasury);
    event FeeUpdated(uint96 newFeeBps);
    event PaymentTokenUpdated(address indexed newToken);
    event OracleUpdated(address indexed newOracle);
    event SystemPauseUpdated(address indexed systemPause);

    constructor(
        address owner_,
        AlphaInsightNovaSeed novaSeed_,
        IERC20 paymentToken_,
        address treasury_,
        uint96 feeBps_
    ) Ownable(owner_) {
        require(address(novaSeed_) != address(0), "NOVA_REQUIRED");
        require(address(paymentToken_) != address(0), "TOKEN_REQUIRED");
        require(treasury_ != address(0), "TREASURY_REQUIRED");
        require(feeBps_ <= 2_000, "FEE_TOO_HIGH");

        novaSeed = novaSeed_;
        paymentToken = paymentToken_;
        treasury = treasury_;
        feeBps = feeBps_;
    }

    modifier onlyOracle() {
        if (msg.sender != owner() && msg.sender != oracle) {
            revert("NOT_ORACLE");
        }
        _;
    }

    modifier onlyOwnerOrSystemPause() {
        if (msg.sender != owner() && msg.sender != _systemPause) {
            revert("NOT_AUTHORIZED");
        }
        _;
    }

    function setPaymentToken(IERC20 newToken) external onlyOwner {
        require(address(newToken) != address(0), "TOKEN_REQUIRED");
        paymentToken = newToken;
        emit PaymentTokenUpdated(address(newToken));
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "TREASURY_REQUIRED");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setFeeBps(uint96 newFeeBps) external onlyOwner {
        require(newFeeBps <= 2_000, "FEE_TOO_HIGH");
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function setOracle(address newOracle) external onlyOwner {
        oracle = newOracle;
        emit OracleUpdated(newOracle);
    }

    function systemPause() external view returns (address) {
        return _systemPause;
    }

    function setSystemPause(address newSystemPause) external onlyOwner {
        _systemPause = newSystemPause;
        emit SystemPauseUpdated(newSystemPause);
    }

    function listInsight(uint256 tokenId, uint256 price) external whenNotPaused {
        require(price > 0, "PRICE_REQUIRED");
        require(novaSeed.ownerOf(tokenId) == msg.sender, "NOT_OWNER");

        novaSeed.transferFrom(msg.sender, address(this), tokenId);

        _listings[tokenId] = Listing({
            seller: msg.sender,
            price: price,
            active: true,
            buyer: address(0),
            listedAt: block.timestamp
        });

        emit ListingCreated(tokenId, msg.sender, price);
    }

    function cancelListing(uint256 tokenId) external {
        Listing storage entry = _listings[tokenId];
        require(entry.active, "NOT_LISTED");
        require(msg.sender == entry.seller || msg.sender == owner(), "NOT_AUTHORIZED");

        entry.active = false;
        novaSeed.safeTransferFrom(address(this), entry.seller, tokenId);
        emit ListingCancelled(tokenId, entry.seller);
    }

    function updateListingPrice(uint256 tokenId, uint256 newPrice) external whenNotPaused {
        require(newPrice > 0, "PRICE_REQUIRED");
        Listing storage entry = _listings[tokenId];
        require(entry.active, "NOT_LISTED");
        if (msg.sender != entry.seller && msg.sender != owner()) {
            revert("NOT_AUTHORIZED");
        }

        uint256 previousPrice = entry.price;
        entry.price = newPrice;
        entry.listedAt = block.timestamp;

        emit ListingPriceUpdated(tokenId, previousPrice, newPrice);
    }

    function buyInsight(uint256 tokenId) external nonReentrant whenNotPaused {
        Listing storage entry = _listings[tokenId];
        require(entry.active, "NOT_LISTED");

        uint256 price = entry.price;
        entry.active = false;
        entry.buyer = msg.sender;

        uint256 fee = (price * feeBps) / 10_000;
        uint256 payout = price - fee;

        paymentToken.safeTransferFrom(msg.sender, address(this), price);
        if (fee > 0) {
            paymentToken.safeTransfer(treasury, fee);
        }
        paymentToken.safeTransfer(entry.seller, payout);

        novaSeed.safeTransferFrom(address(this), msg.sender, tokenId);
        emit InsightPurchased(tokenId, msg.sender, price, fee);
    }

    function forceDelist(uint256 tokenId, address recipient) external onlyOwner nonReentrant {
        require(recipient != address(0), "BAD_RECIPIENT");
        Listing storage entry = _listings[tokenId];
        require(entry.active, "NOT_LISTED");

        entry.active = false;
        entry.buyer = address(0);
        entry.price = 0;
        entry.listedAt = block.timestamp;

        novaSeed.safeTransferFrom(address(this), recipient, tokenId);
        emit ListingForceDelisted(tokenId, msg.sender, recipient);
    }

    function resolvePrediction(uint256 tokenId, bool fulfilled, string calldata notes) external onlyOracle {
        ResolutionRecord storage record = _resolutions[tokenId];
        require(!record.resolved, "ALREADY_RESOLVED");

        record.resolved = true;
        record.fulfilled = fulfilled;
        record.notes = notes;
        record.resolvedAt = block.timestamp;
        record.resolver = msg.sender;

        emit ResolutionLogged(tokenId, fulfilled, notes);
    }

    function listing(uint256 tokenId) external view returns (Listing memory) {
        return _listings[tokenId];
    }

    function resolution(uint256 tokenId) external view returns (ResolutionRecord memory) {
        return _resolutions[tokenId];
    }

    function pause() external onlyOwnerOrSystemPause {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function sweepToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "BAD_TO");
        token.safeTransfer(to, amount);
    }
}
