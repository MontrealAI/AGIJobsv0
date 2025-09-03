// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPaymentRouter {
    /// @notice ERC20 token used for payments
    function token() external view returns (address);

    /// @notice Transfer tokens from caller to a recipient
    /// @param to recipient address
    /// @param amount token amount with 18 decimals
    function transfer(address to, uint256 amount) external;

    /// @notice Transfer tokens from one address to another using allowance
    function transferFrom(address from, address to, uint256 amount) external;

    /// @notice Burn tokens from the specified address using allowance
    function burn(address from, uint256 amount) external;
}
