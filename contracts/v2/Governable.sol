// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Governable
/// @notice Simple governance-controlled access mechanism where all privileged
/// calls must come through a TimelockController. This enforces delayed
/// execution and coordination via a timelock or multisig that inherits from
/// OpenZeppelin's TimelockController.

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

abstract contract Governable {
    TimelockController public governance;

    event GovernanceUpdated(address indexed newGovernance);

    /// @dev Thrown when a zero address is supplied where a non-zero address is required.
    error ZeroAddress();

    /// @dev Thrown when the caller is not the governance contract.
    error NotGovernance();

    constructor(address _governance) {
        if (_governance == address(0)) revert ZeroAddress();
        governance = TimelockController(payable(_governance));
    }

    modifier onlyGovernance() {
        if (msg.sender != address(governance)) revert NotGovernance();
        _;
    }

    function setGovernance(address _governance) public onlyGovernance {
        if (_governance == address(0)) revert ZeroAddress();
        governance = TimelockController(payable(_governance));
        emit GovernanceUpdated(_governance);
    }

    /// @notice Compatibility helper for systems expecting Ownable-style `owner()`
    function owner() public view returns (address) {
        return address(governance);
    }
}

