// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
import "@openzeppelin/contracts/governance/TimelockController.sol";

contract TimelockControllerHarness is TimelockController {
    constructor(address admin) TimelockController(0, new address[](0), new address[](0), admin) {}
}
