// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IJobRegistryAck} from "../interfaces/IJobRegistryAck.sol";

contract JobRegistryAckRevert is IJobRegistryAck {
    function acknowledgeTaxPolicy() external pure returns (string memory) {
        revert("fail");
    }

    function acknowledgeFor(address) external pure returns (string memory) {
        revert("fail");
    }
}

