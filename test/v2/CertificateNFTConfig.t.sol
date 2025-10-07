// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {CertificateNFT} from "../../contracts/v2/modules/CertificateNFT.sol";

contract CertificateNFTConfigTest is Test {
    CertificateNFT nft;
    address recipient = address(0xCAFE);

    function setUp() public {
        nft = new CertificateNFT("Certificate", "CERT");
        nft.setJobRegistry(address(this));
    }

    function testSetBaseURIEmitsAndUpdatesStorage() public {
        string memory base = "https://example.com/";
        vm.expectEmit(false, false, false, true, address(nft));
        emit CertificateNFT.BaseURISet(base);
        nft.setBaseURI(base);
        uint256 tokenId = nft.mint(recipient, 1, bytes32(uint256(1)));
        assertEq(nft.tokenURI(tokenId), string(abi.encodePacked(base, "1")), "base URI not applied");
    }

    function testUpdateBaseURIEmitsAndUpdatesStorage() public {
        string memory initialBase = "https://initial/";
        nft.setBaseURI(initialBase);
        string memory updatedBase = "https://updated/";
        vm.expectEmit(false, false, false, true, address(nft));
        emit CertificateNFT.BaseURIUpdated(initialBase, updatedBase);
        nft.updateBaseURI(updatedBase);
        uint256 tokenId = nft.mint(recipient, 2, bytes32(uint256(2)));
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
}
