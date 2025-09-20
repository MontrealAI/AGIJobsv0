// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Simple 18-decimal ERC-20 token for local testing with optional dev minting.
contract MockERC20 is ERC20 {
    /// @notice Address allowed to perform dev minting.
    address public immutable dev;

    /// @notice Deploy the mock token and mint an initial supply to the deployer.
    /// @param name_ Token name.
    /// @param symbol_ Token symbol.
    /// @param initialSupply Initial supply to mint to the deployer.
    constructor(string memory name_, string memory symbol_, uint256 initialSupply) ERC20(name_, symbol_) {
        dev = msg.sender;
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
        }
    }

    /// @inheritdoc ERC20
    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /// @notice Mint additional tokens for development and testing.
    /// @param to Recipient address.
    /// @param amount Amount of tokens to mint.
    function devMint(address to, uint256 amount) external {
        require(msg.sender == dev, "MockERC20: caller is not dev");
        _mint(to, amount);
    }
}
