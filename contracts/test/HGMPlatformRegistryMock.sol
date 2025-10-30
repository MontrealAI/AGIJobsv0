// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IPlatformRegistryControl} from "../v2/interfaces/IPlatformRegistryControl.sol";

contract HGMPlatformRegistryMock is IPlatformRegistryControl {
    ConfigUpdate public lastConfig;
    uint256 public registrarUpdates;
    uint256 public blacklistUpdates;
    address public pauser;
    address public pauserManager;
    uint256 public applyCalls;

    function setPauser(address _pauser) external override {
        pauser = _pauser;
    }

    function setPauserManager(address manager) external override {
        pauserManager = manager;
    }

    function applyConfiguration(
        ConfigUpdate calldata config,
        RegistrarConfig[] calldata registrarChanges,
        BlacklistConfig[] calldata blacklistChanges
    ) external override {
        lastConfig = config;
        registrarUpdates = registrarChanges.length;
        blacklistUpdates = blacklistChanges.length;
        applyCalls += 1;
    }
}
