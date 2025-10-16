// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestStablecoin
/// @notice Minimal ERC20 used for exercising ERC20-based financing flows in tests.
contract TestStablecoin is ERC20 {
    constructor() ERC20("Test Stablecoin", "TST") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
