// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title Governable
/// @notice Minimal governance control compatible with multisig or timelock.
/// @dev Replaces direct Ownable usage allowing any address to act as
///      governance, including multisig or timelock contracts.
abstract contract Governable {
    /// @notice Address authorized to manage the contract.
    address public governance;

    /// @notice Emitted when governance is transferred.
    event GovernanceTransferred(
        address indexed previousGovernance,
        address indexed newGovernance
    );

    error NotGovernance();
    error InvalidGovernance();

    /// @param initialGovernance Address of the initial governance contract.
    constructor(address initialGovernance) {
        if (initialGovernance == address(0)) revert InvalidGovernance();
        governance = initialGovernance;
        emit GovernanceTransferred(address(0), initialGovernance);
    }

    /// @notice Restrict a function to governance only.
    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    /// @notice Transfer governance to a new address.
    /// @param newGovernance Address of the new governance contract.
    function transferGovernance(address newGovernance) public onlyGovernance {
        if (newGovernance == address(0)) revert InvalidGovernance();
        emit GovernanceTransferred(governance, newGovernance);
        governance = newGovernance;
    }
}

