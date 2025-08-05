// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC721 is ERC721 {
    uint256 public nextId;

    constructor() ERC721("MockNFT", "MNFT") {}

    function mint(address to) external {
        _safeMint(to, nextId++);
    }
}
