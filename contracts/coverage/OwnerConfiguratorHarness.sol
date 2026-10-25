// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {OwnerConfigurator} from "../v2/admin/OwnerConfigurator.sol";

contract OwnerConfiguratorHarness is OwnerConfigurator {
    constructor(address initialOwner) OwnerConfigurator(initialOwner) {}

    function applyConfiguration(ConfigurationCall memory call)
        external
        payable
        returns (bytes memory)
    {
        if (msg.value != call.value) {
            revert OwnerConfigurator__ValueMismatch(call.value, msg.value);
        }
        return _applyConfiguration(call);
    }
}
