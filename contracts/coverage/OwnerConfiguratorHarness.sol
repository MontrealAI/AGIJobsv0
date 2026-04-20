// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {OwnerConfigurator} from "../v2/admin/OwnerConfigurator.sol";

contract OwnerConfiguratorHarness is OwnerConfigurator {
    constructor(address initialOwner) OwnerConfigurator(initialOwner) {}

    function applyConfiguration(ConfigurationCall memory call)
        external
        returns (bytes memory)
    {
        return _applyConfiguration(call, 0);
    }

    function applyConfigurationWithValue(
        ConfigurationCall memory call,
        uint256 value
    ) external payable returns (bytes memory) {
        if (msg.value != value) {
            revert OwnerConfigurator__ValueMismatch(value, msg.value);
        }

        return _applyConfiguration(call, value);
    }
}
