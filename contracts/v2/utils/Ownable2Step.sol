// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step as OpenZeppelinOwnable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title Ownable2Step
/// @dev Extends OpenZeppelin's Ownable2Step by exposing a constructor
/// that forwards the initial owner to the underlying Ownable base.
abstract contract Ownable2Step is OpenZeppelinOwnable2Step {
    constructor(address initialOwner) Ownable(initialOwner) {}
}
