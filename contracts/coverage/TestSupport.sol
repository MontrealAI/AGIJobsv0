// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../test/MockERC20.sol";

/// @dev Compiles test helper contracts when running coverage-specific suites.
contract TestSupportCoverage is MockERC20 {}
