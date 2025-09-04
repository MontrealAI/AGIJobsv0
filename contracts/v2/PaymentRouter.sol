// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Governable} from "./Governable.sol";

/// @title PaymentRouter
/// @notice Simple governance controlled helper for ERC20 transfers and approvals.
contract PaymentRouter is Governable {
    using SafeERC20 for IERC20;

    /// @notice ERC20 token used for all transfers.
    IERC20 public token;

    event TokenUpdated(address indexed token);

    constructor(address _governance, IERC20 _token) Governable(_governance) {
        token = _token;
    }

    /// @notice Update the token reference.
    /// @param _token Address of the new ERC20 token.
    function setToken(address _token) external onlyGovernance {
        token = IERC20(_token);
        emit TokenUpdated(_token);
    }

    /// @notice Transfer tokens from this contract to `to`.
    /// @param to Recipient address.
    /// @param amount Token amount with 18 decimals.
    function transfer(address to, uint256 amount) external onlyGovernance {
        token.safeTransfer(to, amount);
    }

    /// @notice Approve `spender` to spend tokens.
    /// @param spender Address allowed to spend tokens.
    /// @param amount Amount of tokens to approve.
    function approve(address spender, uint256 amount) external onlyGovernance {
        token.forceApprove(spender, amount);
    }
}

