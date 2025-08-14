// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IPlatformRegistry} from "./IPlatformRegistry.sol";

/// @title IPlatformRegistryFull
/// @notice Extended interface exposing registration helpers
interface IPlatformRegistryFull is IPlatformRegistry {
    /// @notice Register an operator on their behalf
    function registerFor(address operator) external;

    /// @notice Register caller after acknowledging the tax policy
    function acknowledgeAndRegister() external;

    /// @notice Deposit stake and register caller in one call
    function stakeAndRegister(uint256 amount) external;

    /// @notice Register an operator on their behalf after acknowledgement
    function acknowledgeAndRegisterFor(address operator) external;

    /// @notice Acknowledge the tax policy, stake and register caller
    function acknowledgeStakeAndRegister(uint256 amount) external;

    /// @notice Deregister caller after acknowledging the tax policy
    function acknowledgeAndDeregister() external;

    /// @notice Authorize or revoke a registrar
    function setRegistrar(address registrar, bool allowed) external;
}
