// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IPlatformRegistryControl
/// @notice Partial interface mirroring the configuration surface required by
///         the HGM control module.
interface IPlatformRegistryControl {
    struct ConfigUpdate {
        bool setStakeManager;
        address stakeManager;
        bool setReputationEngine;
        address reputationEngine;
        bool setMinPlatformStake;
        uint256 minPlatformStake;
        bool setPauser;
        address pauser;
        bool setPauserManager;
        address pauserManager;
    }

    struct RegistrarConfig {
        address registrar;
        bool allowed;
    }

    struct BlacklistConfig {
        address operator;
        bool status;
    }

    function setPauser(address pauser) external;

    function setPauserManager(address manager) external;

    function applyConfiguration(
        ConfigUpdate calldata config,
        RegistrarConfig[] calldata registrarUpdates,
        BlacklistConfig[] calldata blacklistUpdates
    ) external;
}
