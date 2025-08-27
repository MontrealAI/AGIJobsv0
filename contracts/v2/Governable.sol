// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title Governable
/// @notice Simple governance-controlled access mechanism where all privileged
/// calls must come through a TimelockController. This enforces delayed
/// execution and coordination via a timelock or multisig that inherits from
/// OpenZeppelin's TimelockController.

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

abstract contract Governable {
    TimelockController public governance;

    event GovernanceUpdated(address indexed newGovernance);

    constructor(address _governance) {
        require(_governance != address(0), "governance");
        governance = TimelockController(payable(_governance));
    }

    modifier onlyGovernance() {
        require(msg.sender == address(governance), "governance only");
        _;
    }

    function setGovernance(address _governance) public onlyGovernance {
        require(_governance != address(0), "governance");
        governance = TimelockController(payable(_governance));
        emit GovernanceUpdated(_governance);
    }

    /// @notice Compatibility helper for systems expecting Ownable-style `owner()`
    function owner() public view returns (address) {
        return address(governance);
    }
}

