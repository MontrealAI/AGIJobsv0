// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {
    JobRegistry,
    IReputationEngine as JIReputationEngine,
    IDisputeModule as JIDisputeModule,
    ICertificateNFT as JICertificateNFT
} from "./JobRegistry.sol";
import {StakeManager} from "./StakeManager.sol";
import {ValidationModule} from "./ValidationModule.sol";
import {ReputationEngine} from "./ReputationEngine.sol";
import {DisputeModule} from "./modules/DisputeModule.sol";
import {CertificateNFT} from "./CertificateNFT.sol";
import {PlatformRegistry, IReputationEngine as PRReputationEngine} from "./PlatformRegistry.sol";
import {JobRouter} from "./modules/JobRouter.sol";
import {PlatformIncentives} from "./PlatformIncentives.sol";
import {FeePool} from "./FeePool.sol";
import {TaxPolicy} from "./TaxPolicy.sol";
import {IPlatformRegistryFull} from "./interfaces/IPlatformRegistryFull.sol";
import {IPlatformRegistry} from "./interfaces/IPlatformRegistry.sol";
import {IJobRouter} from "./interfaces/IJobRouter.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IReputationEngine as IRInterface} from "./interfaces/IReputationEngine.sol";

/// @title Deployer
/// @notice One shot helper that deploys and wires the core module set.
/// @dev Each module is deployed with default parameters (zero values) and
///      ownership is transferred to the caller once wiring is complete.
contract Deployer {
    bool public deployed;

    event Deployed(
        address stakeManager,
        address jobRegistry,
        address validationModule,
        address reputationEngine,
        address disputeModule,
        address certificateNFT,
        address platformRegistry,
        address jobRouter,
        address platformIncentives,
        address feePool,
        address taxPolicy
    );

    /// @notice Deploy and wire all modules including TaxPolicy.
    /// @return stakeManager Address of the StakeManager
    /// @return jobRegistry Address of the JobRegistry
    /// @return validationModule Address of the ValidationModule
    /// @return reputationEngine Address of the ReputationEngine
    /// @return disputeModule Address of the DisputeModule
    /// @return certificateNFT Address of the CertificateNFT
    /// @return platformRegistry Address of the PlatformRegistry
    /// @return jobRouter Address of the JobRouter
    /// @return platformIncentives Address of the PlatformIncentives helper
    /// @return feePool Address of the FeePool
    /// @return taxPolicy Address of the TaxPolicy
    function deploy()
        external
        returns (
            address stakeManager,
            address jobRegistry,
            address validationModule,
            address reputationEngine,
            address disputeModule,
            address certificateNFT,
            address platformRegistry,
            address jobRouter,
            address platformIncentives,
            address feePool,
            address taxPolicy
        )
    {
        return _deploy(true);
    }

    /// @notice Deploy and wire all modules without the TaxPolicy.
    /// @return stakeManager Address of the StakeManager
    /// @return jobRegistry Address of the JobRegistry
    /// @return validationModule Address of the ValidationModule
    /// @return reputationEngine Address of the ReputationEngine
    /// @return disputeModule Address of the DisputeModule
    /// @return certificateNFT Address of the CertificateNFT
    /// @return platformRegistry Address of the PlatformRegistry
    /// @return jobRouter Address of the JobRouter
    /// @return platformIncentives Address of the PlatformIncentives helper
    /// @return feePool Address of the FeePool
    /// @return taxPolicy Address of the TaxPolicy (always zero)
    function deployWithoutTaxPolicy()
        external
        returns (
            address stakeManager,
            address jobRegistry,
            address validationModule,
            address reputationEngine,
            address disputeModule,
            address certificateNFT,
            address platformRegistry,
            address jobRouter,
            address platformIncentives,
            address feePool,
            address taxPolicy
        )
    {
        return _deploy(false);
    }

    function _deploy(bool withTaxPolicy)
        internal
        returns (
            address stakeManager,
            address jobRegistry,
            address validationModule,
            address reputationEngine,
            address disputeModule,
            address certificateNFT,
            address platformRegistry,
            address jobRouter,
            address platformIncentives,
            address feePool,
            address taxPolicy
        )
    {
        require(!deployed, "deployed");
        deployed = true;
        address owner = msg.sender;

        StakeManager stake = new StakeManager(
            IERC20(address(0)),
            0,
            0,
            0,
            owner,
            address(0),
            address(0)
        );

        JobRegistry registry = new JobRegistry(
            IValidationModule(address(0)),
            IStakeManager(address(0)),
            JIReputationEngine(address(0)),
            JIDisputeModule(address(0)),
            JICertificateNFT(address(0)),
            IFeePool(address(0)),
            ITaxPolicy(address(0)),
            0,
            0
        );

        ValidationModule validation = new ValidationModule(
            IJobRegistry(address(registry)),
            IStakeManager(address(stake)),
            0,
            0,
            0,
            0,
            new address[](0)
        );

        ReputationEngine reputation = new ReputationEngine();

        DisputeModule dispute = new DisputeModule(
            IJobRegistry(address(registry)),
            0,
            0,
            owner
        );

        CertificateNFT certificate = new CertificateNFT("Cert", "CERT");
        certificate.setJobRegistry(address(registry));

        FeePool pool = new FeePool(
            IERC20(address(0)),
            IStakeManager(address(stake)),
            IStakeManager.Role.Platform,
            0,
            owner
        );

        IRInterface repInterface = IRInterface(address(reputation));
        PlatformRegistry pRegistry = new PlatformRegistry(
            IStakeManager(address(stake)),
            PRReputationEngine(address(reputation)),
            0
        );

        JobRouter router = new JobRouter(IPlatformRegistry(address(pRegistry)));

        PlatformIncentives incentives = new PlatformIncentives(
            IStakeManager(address(stake)),
            IPlatformRegistryFull(address(pRegistry)),
            IJobRouter(address(router))
        );

        TaxPolicy policy;
        if (withTaxPolicy) {
            policy = new TaxPolicy(
                "ipfs://policy",
                "All taxes on participants; contract and owner exempt"
            );
        }

        // Wire modules
        registry.setModules(
            validation,
            IStakeManager(address(stake)),
            JIReputationEngine(address(reputation)),
            JIDisputeModule(address(dispute)),
            JICertificateNFT(address(certificate))
        );
        registry.setFeePool(IFeePool(address(pool)));
        if (address(policy) != address(0)) {
            registry.setTaxPolicy(ITaxPolicy(address(policy)));
        }

        validation.setReputationEngine(repInterface);
        stake.setModules(address(registry), address(dispute));
        incentives.setModules(
            IStakeManager(address(stake)),
            IPlatformRegistryFull(address(pRegistry)),
            IJobRouter(address(router))
        );
        pRegistry.setRegistrar(address(incentives), true);
        router.setRegistrar(address(incentives), true);
        reputation.setCaller(address(registry), true);
        reputation.setCaller(address(validation), true);

        // Transfer ownership
        registry.transferOwnership(owner);
        stake.transferOwnership(owner);
        validation.transferOwnership(owner);
        reputation.transferOwnership(owner);
        dispute.transferOwnership(owner);
        certificate.transferOwnership(owner);
        pRegistry.transferOwnership(owner);
        router.transferOwnership(owner);
        incentives.transferOwnership(owner);
        pool.transferOwnership(owner);
        if (address(policy) != address(0)) {
            policy.transferOwnership(owner);
        }

        emit Deployed(
            address(stake),
            address(registry),
            address(validation),
            address(reputation),
            address(dispute),
            address(certificate),
            address(pRegistry),
            address(router),
            address(incentives),
            address(pool),
            address(policy)
        );

        return (
            address(stake),
            address(registry),
            address(validation),
            address(reputation),
            address(dispute),
            address(certificate),
            address(pRegistry),
            address(router),
            address(incentives),
            address(pool),
            address(policy)
        );
    }
}
