// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {CertificateNFT} from "../../contracts/v2/modules/CertificateNFT.sol";

contract CertificateNFTConfigTest is Test, IERC721Receiver {
    CertificateNFT nft;

    function setUp() public {
        nft = new CertificateNFT("Certificate", "CERT");
        nft.setJobRegistry(address(this));
    }

    function testSetBaseURIEmitsAndUpdatesStorage() public {
        string memory base = "https://example.com/";
        vm.expectEmit(false, false, false, true, address(nft));
        emit CertificateNFT.BaseURISet(base);
        nft.setBaseURI(base);
        uint256 tokenId = nft.mint(address(this), 1, bytes32(uint256(1)));
        assertEq(nft.tokenURI(tokenId), string(abi.encodePacked(base, "1")), "base URI not applied");
    }

    function testUpdateBaseURIEmitsAndUpdatesStorage() public {
        string memory initialBase = "https://initial/";
        nft.setBaseURI(initialBase);
        string memory updatedBase = "https://updated/";
        vm.expectEmit(false, false, false, true, address(nft));
        emit CertificateNFT.BaseURIUpdated(initialBase, updatedBase);
        nft.updateBaseURI(updatedBase);
        uint256 tokenId = nft.mint(address(this), 2, bytes32(uint256(2)));
        assertEq(
            nft.tokenURI(tokenId),
            string(abi.encodePacked(updatedBase, "2")),
            "updated base URI not applied"
        );
    }

    function testSetBaseURIEmptyReverts() public {
        vm.expectRevert(CertificateNFT.EmptyBaseURI.selector);
        nft.setBaseURI("");
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
