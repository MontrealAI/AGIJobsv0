// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IJobRouter
/// @notice Minimal interface for registering platforms with the router
interface IJobRouter {
    /// @notice Register an operator on their behalf
    function registerFor(address operator) external;

    /// @notice Whether an operator is registered
    function registered(address operator) external view returns (bool);

    /// @notice Authorize or revoke a registrar
    function setRegistrar(address registrar, bool allowed) external;
}
