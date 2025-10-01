// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "../v2/Governable.sol";

/// @title GovernanceTarget
/// @notice Minimal Governable contract used to exercise timelock actions in tests.
contract GovernanceTarget is Governable {
    uint256 public value;

    event ValueUpdated(uint256 indexed newValue);

    constructor(address governance) Governable(governance) {}

    /// @notice Update the stored value via governance proposal.
    /// @param newValue Value written after a successful timelock execution.
    function setValue(uint256 newValue) external onlyGovernance {
        value = newValue;
        emit ValueUpdated(newValue);
    }
}
