// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SovereignVault
 * @notice Minimal holding contract that receives the proceeds from α-AGI MARK once the Nova-Seed is launched.
 */
contract SovereignVault is Ownable {
    event FundsReceived(address indexed from, uint256 amount);
    event FundsWithdrawn(address indexed to, uint256 amount);
    event MandateUpdated(string mandate);

    string private _mandate;

    constructor(address owner_, string memory initialMandate) Ownable(owner_) {
        _mandate = initialMandate;
        emit MandateUpdated(initialMandate);
    }

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    function updateMandate(string calldata newMandate) external onlyOwner {
        _mandate = newMandate;
        emit MandateUpdated(newMandate);
    }

    function mandate() external view returns (string memory) {
        return _mandate;
    }

    function sweep(address payable recipient) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "Vault empty");
        (bool ok, ) = recipient.call{value: balance}("");
        require(ok, "Sweep failed");
        emit FundsWithdrawn(recipient, balance);
    }
}
