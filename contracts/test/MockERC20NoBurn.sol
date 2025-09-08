// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Mock ERC20 token without burn function for constructor tests.
contract MockERC20NoBurn is ERC20 {
    constructor() ERC20("MockToken", "MTK") {
        _mint(msg.sender, 1e24);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

