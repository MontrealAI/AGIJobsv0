// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IPaymentRouter
/// @notice Interface for routing ERC20 token transfers
interface IPaymentRouter {
    /// @notice ERC20 token used for transfers
    function token() external view returns (IERC20);

    /// @notice Transfer tokens from caller to the `to` address
    /// @param to Recipient of the tokens
    /// @param amt Amount to transfer
    function transfer(address to, uint256 amt) external;
}

