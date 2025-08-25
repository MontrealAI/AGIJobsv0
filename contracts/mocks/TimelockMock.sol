// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Minimal timelock-style forwarder used for testing ownership transfer.
contract TimelockMock is Ownable {
    constructor(address admin) Ownable(admin) {}

    function execute(address target, bytes calldata data) external onlyOwner {
        (bool ok, ) = target.call(data);
        require(ok, "exec failed");
    }
}
