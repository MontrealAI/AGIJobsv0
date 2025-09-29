// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Mock ERC20 token whose metadata accessors revert.
contract MockERC20NoMetadata is ERC20 {
    constructor() ERC20("MockNoMetadata", "MNM") {
        _mint(msg.sender, 1e24);
    }

    function decimals() public pure override returns (uint8) {
        revert("MockERC20NoMetadata: decimals unavailable");
    }
}
