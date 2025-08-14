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
import {IFeePool} from "./interfaces/IFeePool.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";

interface IOwnable {
    function transferOwnership(address newOwner) external;
}

/// @title ModuleInstaller
/// @notice Wires deployed modules together in a single transaction.
/// @dev Each module must transfer ownership to this installer prior to calling
///      {initialize}. After wiring, ownership can be reclaimed via the modules'
///      own `transferOwnership` functions.
contract ModuleInstaller {
    bool public initialized;
    address public owner;

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
        address jobRouter,
        address feePool,
        address taxPolicy
    );

    /// @notice Sets the deployer as the temporary owner.
    constructor() {
        owner = msg.sender;
    }

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
    /// @param feePool Address of the FeePool contract
    /// @param taxPolicy Address of the TaxPolicy contract (optional)
    function initialize(
        JobRegistry jobRegistry,
        StakeManager stakeManager,
        IValidationModule validationModule,
        IReputationEngine reputationEngine,
        IDisputeModule disputeModule,
        ICertificateNFT certificateNFT,
        PlatformIncentives platformIncentives,
        IPlatformRegistryFull platformRegistry,
        IJobRouter jobRouter,
        IFeePool feePool,
        ITaxPolicy taxPolicy
    ) external {
        require(!initialized, "init");
        require(msg.sender == owner, "owner");
        initialized = true;

        jobRegistry.setModules(
            validationModule,
            IStakeManager(address(stakeManager)),
            reputationEngine,
            disputeModule,
            certificateNFT
        );
        jobRegistry.setFeePool(feePool);
        if (address(taxPolicy) != address(0)) {
            jobRegistry.setTaxPolicy(taxPolicy);
        }
        jobRegistry.setAcknowledger(address(stakeManager), true);
        jobRegistry.setAcknowledger(address(platformRegistry), true);
        jobRegistry.setAcknowledger(address(platformIncentives), true);
        stakeManager.setModules(address(jobRegistry), address(disputeModule));
        platformIncentives.setModules(
            IStakeManager(address(stakeManager)),
            platformRegistry,
            jobRouter
        );
        platformRegistry.setRegistrar(address(platformIncentives), true);
        jobRouter.setRegistrar(address(platformIncentives), true);

        jobRegistry.transferOwnership(msg.sender);
        stakeManager.transferOwnership(msg.sender);
        IOwnable(address(validationModule)).transferOwnership(msg.sender);
        IOwnable(address(reputationEngine)).transferOwnership(msg.sender);
        IOwnable(address(disputeModule)).transferOwnership(msg.sender);
        IOwnable(address(certificateNFT)).transferOwnership(msg.sender);
        platformIncentives.transferOwnership(msg.sender);
        IOwnable(address(platformRegistry)).transferOwnership(msg.sender);
        IOwnable(address(jobRouter)).transferOwnership(msg.sender);
        IOwnable(address(feePool)).transferOwnership(msg.sender);
        if (address(taxPolicy) != address(0)) {
            IOwnable(address(taxPolicy)).transferOwnership(msg.sender);
        }

        emit ModulesInstalled(
            address(jobRegistry),
            address(stakeManager),
            address(validationModule),
            address(reputationEngine),
            address(disputeModule),
            address(certificateNFT),
            address(platformIncentives),
            address(platformRegistry),
            address(jobRouter),
            address(feePool),
            address(taxPolicy)
        );
    }
}

