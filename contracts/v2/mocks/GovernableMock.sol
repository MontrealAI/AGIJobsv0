// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "../Governable.sol";

/// @notice Simple contract used for testing governance handover via TimelockController.
contract GovernableMock is Governable {
    uint256 public value;

    constructor(address governance) Governable(governance) {}

    function setValue(uint256 _value) external onlyGovernance {
        value = _value;
    }
}

