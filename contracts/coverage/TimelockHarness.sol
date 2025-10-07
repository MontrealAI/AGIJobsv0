// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {AGITimelock} from "../v2/governance/AGITimelock.sol";

contract TimelockHarness is AGITimelock {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) AGITimelock(minDelay, proposers, executors, admin) {}
}
