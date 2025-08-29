// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC20 test token with non‑standard 6 decimals used only in tests
/// to ensure production modules reject tokens that don't match the
/// 18‑decimal AGIALPHA requirement.
contract MockERC20SixDecimals is ERC20 {
    constructor() ERC20("Mock6D", "M6D") {
        _mint(msg.sender, 1e24);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
