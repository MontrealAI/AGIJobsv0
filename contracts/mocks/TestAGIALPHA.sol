// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestAGIALPHA
/// @notice Minimal IERC20-compatible token used for testnet deployments.
/// @dev Decimals are immutable and an initial supply is minted in the constructor
///      to the provided recipient. No additional minting functionality is exposed
///      to keep behaviour deterministic across environments.
contract TestAGIALPHA is ERC20 {
    /// @notice Immutable decimals value returned by the token.
    uint8 private immutable _decimals;

    /// @param name_ ERC-20 name for the mock token.
    /// @param symbol_ ERC-20 symbol for the mock token.
    /// @param decimals_ Number of decimals used for token accounting.
    /// @param initialRecipient Address that receives the initial supply.
    /// @param initialSupply Amount of tokens minted to the initial recipient.
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address initialRecipient,
        uint256 initialSupply
    ) ERC20(name_, symbol_) {
        require(initialRecipient != address(0), "TestAGIALPHA: zero recipient");
        _decimals = decimals_;
        _mint(initialRecipient, initialSupply);
    }

    /// @inheritdoc ERC20
    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
