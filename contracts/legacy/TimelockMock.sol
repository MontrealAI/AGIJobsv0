// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Minimal timelock-style forwarder used for testing ownership transfer.
contract TimelockMock is Ownable {
    constructor(address admin) Ownable(admin) {}

    function execute(address target, bytes calldata data) external onlyOwner {
        (bool ok, ) = target.call(data);
        require(ok, "exec failed");
    }
}
