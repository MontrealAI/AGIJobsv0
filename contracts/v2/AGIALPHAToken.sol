// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AGIALPHAToken
/// @notice ERC20 token with 6 decimals used across AGI Jobs v2.
/// @dev Owner can mint or burn to maintain full control. Decimals set to 6
///      so all staking and payout amounts match on-chain accounting. The
///      contract holds no special tax logic and never accepts ether to
///      preserve tax neutrality for the owner.
contract AGIALPHAToken is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;

    constructor() ERC20("AGI ALPHA", "AGIALPHA") Ownable(msg.sender) {}

    /// @notice Returns token decimals (6).
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Mint new tokens to an address.
    /// @param to recipient of minted tokens
    /// @param amount token amount with 6 decimals
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Burn tokens from an address.
    /// @param from address holding the tokens
    /// @param amount token amount with 6 decimals
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    /// @dev Reject direct ETH transfers to preserve tax neutrality.
    receive() external payable {
        revert("AGIALPHA: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("AGIALPHA: no ether");
    }
}

