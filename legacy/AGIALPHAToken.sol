// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AGIALPHAToken
/// @author AGI
/// @notice Basic ERC20 token with fixed 6 decimals and initial supply minted to deployer.
contract AGIALPHAToken is ERC20 {
    uint8 private constant DECIMALS = 6;

    /// @notice Deploy the token contract.
    /// @param name_   Token name
    /// @param symbol_ Token symbol
    /// @param initialSupply Initial supply minted to the deployer
    constructor(string memory name_, string memory symbol_, uint256 initialSupply) ERC20(name_, symbol_) {
        _mint(msg.sender, initialSupply);
    }

    /// @notice Returns token decimals (6).
    /// @return The token uses 6 decimals.
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
}

