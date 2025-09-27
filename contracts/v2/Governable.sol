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
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @dev Thrown when a zero address is supplied where a non-zero address is required.
    error ZeroAddress();

    /// @dev Thrown when the caller is not the governance contract.
    error NotGovernance();

    constructor(address _governance) {
        if (_governance == address(0)) revert ZeroAddress();
        _setGovernance(_governance);
    }

    function _setGovernance(address _governance) internal {
        if (_governance == address(0)) revert ZeroAddress();
        address previousOwner = address(governance);
        governance = TimelockController(payable(_governance));
        emit GovernanceUpdated(_governance);
        emit OwnershipTransferred(previousOwner, _governance);
    }

    function _checkGovernor() internal view {
        if (msg.sender != address(governance)) revert NotGovernance();
    }

    modifier onlyGovernance() {
        _checkGovernor();
        _;
    }

    function setGovernance(address _governance) public onlyGovernance {
        _setGovernance(_governance);
    }

    function transferOwnership(address newOwner) public onlyGovernance {
        _setGovernance(newOwner);
    }

    /// @notice Compatibility helper for systems expecting Ownable-style `owner()`
    function owner() public view returns (address) {
        return address(governance);
    }
}

