// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Mock ERC20 token with 6 decimals for constructor tests.
contract MockERC206Decimals is ERC20 {
    constructor() ERC20("MockToken", "MTK") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
