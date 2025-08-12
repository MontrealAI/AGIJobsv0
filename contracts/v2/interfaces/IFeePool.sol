// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IFeePool
/// @notice Minimal interface for depositing job fees and owner controls
interface IFeePool {
    /// @notice notify the pool about newly received fees
    /// @param amount amount of tokens transferred to the pool scaled to 6 decimals
    function depositFee(uint256 amount) external;

    /// @notice distribute pending fees to stakers
    function distributeFees() external;

    /// @notice claim accumulated rewards for caller
    function claimRewards() external;

    /// @notice transfer tokens from the pool to a recipient
    /// @param to address receiving the tokens
    /// @param amount token amount with 6 decimals
    function transferReward(address to, uint256 amount) external;

    /// @notice update percentage of fees to burn (only owner)
    function setBurnPct(uint256 pct) external;

    /// @notice update treasury address receiving dust (only owner)
    function setTreasury(address treasury) external;

    /// @notice update ERC20 token used for payouts (only owner)
    function setToken(IERC20 newToken) external;
}
