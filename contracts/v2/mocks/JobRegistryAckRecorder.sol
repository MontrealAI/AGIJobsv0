// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IJobRegistryAck} from "../interfaces/IJobRegistryAck.sol";
import {IJobRegistryTax} from "../interfaces/IJobRegistryTax.sol";
import {ITaxPolicy} from "../interfaces/ITaxPolicy.sol";

/// @dev JobRegistry mock that records acknowledgements through an attached tax policy.
contract JobRegistryAckRecorder is IJobRegistryAck, IJobRegistryTax {
    error NotAcknowledger();

    ITaxPolicy public policy;
    mapping(address => bool) public acknowledgers;

    constructor(ITaxPolicy _policy) {
        policy = _policy;
    }

    function setAcknowledger(address acknowledger, bool allowed) external {
        acknowledgers[acknowledger] = allowed;
    }

    function acknowledgeTaxPolicy() external returns (string memory) {
        return policy.acknowledge();
    }

    function acknowledgeFor(address user) external returns (string memory) {
        if (!acknowledgers[msg.sender]) revert NotAcknowledger();
        return policy.acknowledgeFor(user);
    }

    function taxPolicy() external view returns (ITaxPolicy) {
        return policy;
    }

    function version() external pure returns (uint256) {
        return 2;
    }
}
