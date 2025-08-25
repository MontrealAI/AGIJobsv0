// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title Governable
/// @notice Simple governance-controlled access mechanism compatible with TimelockController or multisig wallets.
abstract contract Governable {
    address public governance;

    event GovernanceUpdated(address indexed newGovernance);

    constructor(address _governance) {
        require(_governance != address(0), "governance");
        governance = _governance;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "governance only");
        _;
    }

    function setGovernance(address _governance) public onlyGovernance {
        require(_governance != address(0), "governance");
        governance = _governance;
        emit GovernanceUpdated(_governance);
    }

    /// @notice Compatibility helper for systems expecting Ownable-style `owner()`
    function owner() public view returns (address) {
        return governance;
    }
}

