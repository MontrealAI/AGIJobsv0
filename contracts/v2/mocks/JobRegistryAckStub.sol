// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IJobRegistryAck} from "../interfaces/IJobRegistryAck.sol";
import {IJobRegistryTax} from "../interfaces/IJobRegistryTax.sol";
import {ITaxPolicy} from "../interfaces/ITaxPolicy.sol";

/// @dev JobRegistry mock that ignores acknowledgement calls.
contract JobRegistryAckStub is IJobRegistryAck, IJobRegistryTax {
    ITaxPolicy public policy;

    constructor(ITaxPolicy _policy) {
        policy = _policy;
    }

    function acknowledgeTaxPolicy() external pure returns (string memory) {
        return "";
    }

    function acknowledgeFor(address) external pure returns (string memory) {
        // Intentionally do not record acknowledgement
        return "";
    }

    function taxPolicy() external view returns (ITaxPolicy) {
        return policy;
    }

    function version() external pure returns (uint256) {
        return 2;
    }
}
