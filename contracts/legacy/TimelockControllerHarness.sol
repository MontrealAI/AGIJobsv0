// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.
import "@openzeppelin/contracts/governance/TimelockController.sol";

contract TimelockControllerHarness is TimelockController {
    constructor(address admin) TimelockController(0, new address[](0), new address[](0), admin) {}
}
