// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IPlatformRegistry} from "./IPlatformRegistry.sol";

/// @title IPlatformRegistryFull
/// @notice Extended interface exposing registration helpers
interface IPlatformRegistryFull is IPlatformRegistry {
    /// @notice Register an operator on their behalf
    function registerFor(address operator) external;
}
