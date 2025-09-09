// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// @dev Test utility token used to provide an ERC20 code stub for AGIALPHA
// in Hardhat tests. This mock contract deploys a basic ERC20 and allows
// minting additional tokens during tests.

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("MockToken", "MTK") {
        _mint(msg.sender, 1e24);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function burnFrom(address from, uint256 amount) external {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }
}
