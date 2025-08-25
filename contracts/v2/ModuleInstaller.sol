// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {
    JobRegistry,
    IReputationEngine,
    IDisputeModule,
    ICertificateNFT
} from "./JobRegistry.sol";
import {StakeManager} from "./StakeManager.sol";
import {ValidationModule} from "./ValidationModule.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {PlatformIncentives} from "./PlatformIncentives.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IPlatformRegistryFull} from "./interfaces/IPlatformRegistryFull.sol";
import {IJobRouter} from "./interfaces/IJobRouter.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IOwnable {
    function transferOwnership(address newOwner) external;
}

/// @title ModuleInstaller
/// @notice Optional helper wiring deployed modules in a single transaction.
/// @dev Core contracts now accept zero addresses in their constructors so
///      owners may either supply dependencies at deployment or call
///      {initialize} later. Modules must transfer ownership to this installer
///      prior to calling {initialize}. After wiring, ownership can be reclaimed
///      via the modules' own `transferOwnership` functions.
contract ModuleInstaller is Ownable {
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
        address jobRouter,
        address feePool,
        address taxPolicy,
        address identityRegistryAddr
    );

    /// @notice Sets the deployer as the temporary owner.
    constructor() Ownable(msg.sender) {}

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
        ValidationModule validationModule,
        IReputationEngine reputationEngine,
        IDisputeModule disputeModule,
        ICertificateNFT certificateNFT,
        PlatformIncentives platformIncentives,
        IPlatformRegistryFull platformRegistry,
        IJobRouter jobRouter,
        IFeePool feePool,
        ITaxPolicy taxPolicy,
        IIdentityRegistry identityRegistry,
        bytes32 clubRootNode,
        bytes32 agentRootNode,
        bytes32 validatorMerkleRoot,
        bytes32 agentMerkleRoot,
        address[] calldata _ackModules
    ) external onlyOwner {
        require(!initialized, "init");
        initialized = true;

        jobRegistry.setModules(
            validationModule,
            IStakeManager(address(stakeManager)),
            reputationEngine,
            disputeModule,
            certificateNFT,
            feePool,
            _ackModules
        );
        if (address(taxPolicy) != address(0)) {
            jobRegistry.setTaxPolicy(taxPolicy);
        }
        jobRegistry.setIdentityRegistry(identityRegistry);
        validationModule.setIdentityRegistry(identityRegistry);
        identityRegistry.setAgentRootNode(agentRootNode);
        identityRegistry.setClubRootNode(clubRootNode);
        identityRegistry.setAgentMerkleRoot(agentMerkleRoot);
        identityRegistry.setValidatorMerkleRoot(validatorMerkleRoot);
        stakeManager.setModules(address(jobRegistry), address(disputeModule));
        platformIncentives.setModules(
            IStakeManager(address(stakeManager)),
            platformRegistry,
            jobRouter
        );
        platformRegistry.setRegistrar(address(platformIncentives), true);
        jobRouter.setRegistrar(address(platformIncentives), true);

        address moduleOwner = owner();
        jobRegistry.setGovernance(moduleOwner);
        stakeManager.setGovernance(moduleOwner);
        IOwnable(address(validationModule)).transferOwnership(moduleOwner);
        IOwnable(address(reputationEngine)).transferOwnership(moduleOwner);
        IOwnable(address(disputeModule)).transferOwnership(moduleOwner);
        IOwnable(address(certificateNFT)).transferOwnership(moduleOwner);
        platformIncentives.transferOwnership(moduleOwner);
        IOwnable(address(platformRegistry)).transferOwnership(moduleOwner);
        IOwnable(address(jobRouter)).transferOwnership(moduleOwner);
        IOwnable(address(feePool)).transferOwnership(moduleOwner);
        if (address(taxPolicy) != address(0)) {
            IOwnable(address(taxPolicy)).transferOwnership(moduleOwner);
        }
        IOwnable(address(identityRegistry)).transferOwnership(moduleOwner);

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
            address(taxPolicy),
            address(identityRegistry)
        );
    }

    /// @notice Proof that neither this contract nor its owner accrues taxable revenue.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }
}

