// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Simple ERC20 test token reporting 18 decimals.
/// Many tests reference this legacy name, so its interface
/// remains unchanged while decimals now mirror standard 18-decimal
/// tokens used across v2 contracts.
contract MockERC206Decimals is ERC20 {
    constructor() ERC20("Mock18D", "M18D") {
        _mint(msg.sender, 1e24);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
