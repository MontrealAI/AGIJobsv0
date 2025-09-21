// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {CommitRevealMock} from "../CommitRevealMock.sol";

/// @dev Thin wrapper used to limit the compilation surface during coverage runs.
contract CommitRevealCoverage is CommitRevealMock {}
