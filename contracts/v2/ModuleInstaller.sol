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

/// @title ModuleInstaller
/// @notice Wires deployed modules together in a single transaction.
/// @dev Each module must transfer ownership to this installer prior to calling
///      {initialize}. After wiring, ownership can be reclaimed via the modules'
///      own `transferOwnership` functions.
contract ModuleInstaller {
    bool public initialized;

    /// @notice Emitted after all modules are wired together.
    event ModulesInstalled(
        address jobRegistry,
        address stakeManager,
        address validationModule,
        address reputationEngine,
        address disputeModule,
        address certificateNFT,
        address platformIncentives,
        address platformRegistry,
        address jobRouter
    );

    /// @notice Connect core modules after deployment.
    /// @param jobRegistry Address of the JobRegistry contract
    /// @param stakeManager Address of the StakeManager contract
    /// @param validationModule Address of the ValidationModule
    /// @param reputationEngine Address of the ReputationEngine
    /// @param disputeModule Address of the DisputeModule
    /// @param certificateNFT Address of the CertificateNFT
    /// @param platformIncentives Address of the PlatformIncentives helper
    /// @param platformRegistry Address of the PlatformRegistry
    /// @param jobRouter Address of the JobRouter
    function initialize(
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
        require(!initialized, "init");
        initialized = true;

        jobRegistry.setModules(
            validationModule,
            IStakeManager(address(stakeManager)),
            reputationEngine,
            disputeModule,
            certificateNFT
        );
        stakeManager.setModules(address(jobRegistry), address(disputeModule));
        platformIncentives.setModules(
            IStakeManager(address(stakeManager)),
            platformRegistry,
            jobRouter
        );

        emit ModulesInstalled(
            address(jobRegistry),
            address(stakeManager),
            address(validationModule),
            address(reputationEngine),
            address(disputeModule),
            address(certificateNFT),
            address(platformIncentives),
            address(platformRegistry),
            address(jobRouter)
        );
    }
}

