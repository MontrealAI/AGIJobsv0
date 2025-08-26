// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMarketplaceNFT {
    function purchase(uint256 tokenId) external;
}

/// @dev Buyer contract that attempts to reenter the marketplace during a purchase.
contract ReentrantBuyer is IERC721Receiver {
    IMarketplaceNFT public immutable nft;

    constructor(address nft_) {
        nft = IMarketplaceNFT(nft_);
    }

    /// @notice Approve the NFT contract to pull `amount` of the ERC-20 `token`.
    function approveToken(address token, uint256 amount) external {
        IERC20(token).approve(address(nft), amount);
    }

    /// @notice Initiate a purchase which triggers the reentrancy attempt.
    function buy(uint256 tokenId) external {
        nft.purchase(tokenId);
    }

    /// @dev During receipt of the NFT, attempt to purchase again.
    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external returns (bytes4) {
        // Swallow any failure – the second call should revert because the
        // listing was cleared before transfer.
        try nft.purchase(tokenId) {} catch {}
        return this.onERC721Received.selector;
    }
}

