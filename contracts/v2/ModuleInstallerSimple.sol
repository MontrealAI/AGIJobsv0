// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {
    JobRegistry,
    IReputationEngine,
    IDisputeModule,
    ICertificateNFT
} from "./JobRegistry.sol";
import {StakeManager} from "./StakeManager.sol";
import {PlatformIncentives} from "./PlatformIncentives.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IPlatformRegistryFull} from "./interfaces/IPlatformRegistryFull.sol";
import {IJobRouter} from "./interfaces/IJobRouter.sol";

/// @title ModuleInstallerSimple
/// @notice Minimal helper that wires deployed modules together.
/// @dev Deploy each module separately and then call {wire} from the owner
///      account to connect them in a single transaction.
contract ModuleInstallerSimple {
    /// @notice Connect core modules after deployment using the caller as owner.
    /// @param jobRegistry Address of the JobRegistry contract
    /// @param stakeManager Address of the StakeManager contract
    /// @param validationModule Address of the ValidationModule
    /// @param reputationEngine Address of the ReputationEngine
    /// @param disputeModule Address of the DisputeModule
    /// @param certificateNFT Address of the CertificateNFT
    /// @param platformIncentives Address of the PlatformIncentives helper
    /// @param platformRegistry Address of the PlatformRegistry
    /// @param jobRouter Address of the JobRouter
    function wire(
        JobRegistry jobRegistry,
        StakeManager stakeManager,
        IValidationModule validationModule,
        IReputationEngine reputationEngine,
        IDisputeModule disputeModule,
        ICertificateNFT certificateNFT,
        PlatformIncentives platformIncentives,
        IPlatformRegistryFull platformRegistry,
        IJobRouter jobRouter
    ) external {
        jobRegistry.setModules(
            validationModule,
            IStakeManager(address(stakeManager)),
            reputationEngine,
            disputeModule,
            certificateNFT
        );
        stakeManager.setJobRegistry(address(jobRegistry));
        stakeManager.setModules(address(jobRegistry), address(disputeModule));
        platformIncentives.setModules(
            IStakeManager(address(stakeManager)),
            platformRegistry,
            jobRouter
        );
    }
}

