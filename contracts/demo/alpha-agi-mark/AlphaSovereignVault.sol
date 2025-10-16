// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title α-AGI Sovereign Vault
/// @notice Simple treasury that accepts MARK launch proceeds and allows curated mission updates.
contract AlphaSovereignVault is Ownable {
    string private _mission;

    event MissionUpdated(string mission);
    event FundsReceived(address indexed from, uint256 amount);
    event FundsForwarded(address indexed to, uint256 amount);

    constructor(address initialOwner, string memory initialMission) Ownable(initialOwner) {
        _mission = initialMission;
    }

    function mission() external view returns (string memory) {
        return _mission;
    }

    function updateMission(string calldata newMission) external onlyOwner {
        _mission = newMission;
        emit MissionUpdated(newMission);
    }

    function forwardFunds(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) {
            revert("VAULT_ZERO_DESTINATION");
        }
        if (amount > address(this).balance) {
            revert("VAULT_INSUFFICIENT_FUNDS");
        }
        (bool success, ) = to.call{value: amount}("");
        require(success, "VAULT_TRANSFER_FAILED");
        emit FundsForwarded(to, amount);
    }

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }
}
