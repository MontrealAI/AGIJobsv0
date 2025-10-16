// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SovereignVault
 * @notice Simple vault receiving the Nova-Seed treasury once MARK finalises.
 */
contract SovereignVault is Ownable {
    event FundsReceived(address indexed from, uint256 amount);
    event FundsWithdrawn(address indexed to, uint256 amount);

    constructor(address owner_) Ownable(owner_) {
        require(owner_ != address(0), "owner zero");
    }

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "to zero");
        require(amount <= address(this).balance, "insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "withdraw failed");
        emit FundsWithdrawn(to, amount);
    }
}
