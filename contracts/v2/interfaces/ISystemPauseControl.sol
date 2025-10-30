// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ISystemPauseControl
/// @notice Interface for orchestrating coordinated pause operations across core
///         modules.
interface ISystemPauseControl {
    function setGlobalPauser(address pauser) external;

    function refreshPausers() external;

    function pauseAll() external;

    function unpauseAll() external;
}
