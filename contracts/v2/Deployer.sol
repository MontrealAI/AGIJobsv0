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
import {SystemPause} from "./SystemPause.sol";
import {ArbitratorCommittee} from "./ArbitratorCommittee.sol";
import {PlatformRegistry, IReputationEngine as PRReputationEngine} from "./PlatformRegistry.sol";
import {JobRouter} from "./modules/JobRouter.sol";
import {IdentityRegistry} from "./IdentityRegistry.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {PlatformIncentives} from "./PlatformIncentives.sol";
import {FeePool} from "./FeePool.sol";
import {TaxPolicy} from "./TaxPolicy.sol";
import {IPlatformRegistryFull} from "./interfaces/IPlatformRegistryFull.sol";
import {IPlatformRegistry} from "./interfaces/IPlatformRegistry.sol";
import {IJobRouter} from "./interfaces/IJobRouter.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IENS} from "./interfaces/IENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IReputationEngine as IRInterface} from "./interfaces/IReputationEngine.sol";
import {TOKEN_SCALE} from "./Constants.sol";

/// @title Deployer
/// @notice One shot helper that deploys and wires the core module set.
/// @dev Each module is deployed with default parameters (zero values) and
///      ownership is transferred to the SystemPause contract or a supplied
///      governance address once wiring is complete.
contract Deployer is Ownable {
    bool public deployed;

    constructor() Ownable(msg.sender) {}

    /// @notice Economic configuration applied during deployment.
    /// @dev Zero values use each module's baked-in default such as a 5% fee,
    ///      5% burn, 1-day commit/reveal windows and a TOKEN_SCALE minimum stake.
    struct EconParams {
        uint256 feePct; // protocol fee percentage for JobRegistry
        uint256 burnPct; // portion of fees burned by FeePool
        uint256 employerSlashPct; // slashed stake sent to employer
        uint256 treasurySlashPct; // slashed stake sent to treasury
        uint256 commitWindow; // validator commit window in seconds
        uint256 revealWindow; // validator reveal window in seconds
        uint256 minStake; // global minimum stake in StakeManager (18 decimals)
        uint96 jobStake; // minimum agent stake per job in JobRegistry (18 decimals)
    }

    struct IdentityParams {
        IENS ens;
        INameWrapper nameWrapper;
        bytes32 clubRootNode;
        bytes32 agentRootNode;
        bytes32 validatorMerkleRoot;
        bytes32 agentMerkleRoot;
    }

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
        address taxPolicy,
        address identityRegistryAddr,
        address systemPause
    );

    /// @notice Deploy and wire all modules including TaxPolicy.
    /// @param econ Economic parameters. Supply `0` to use module defaults.
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
    // ---------------------------------------------------------------------
    // Deployment entrypoints (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    function deploy(
        EconParams calldata econ,
        IdentityParams calldata ids,
        address governance
    ) external onlyOwner returns (
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
            address taxPolicy,
            address identityRegistryAddr,
            address systemPause
        )
    {
        return _deploy(true, econ, ids, governance);
    }

    /// @notice Deploy and wire all modules without the TaxPolicy.
    /// @param econ Economic parameters. Supply `0` to use module defaults.
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
    function deployWithoutTaxPolicy(
        EconParams calldata econ,
        IdentityParams calldata ids,
        address governance
    ) external onlyOwner returns (
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
            address taxPolicy,
            address identityRegistryAddr,
            address systemPause
        )
    {
        return _deploy(false, econ, ids, governance);
    }

    /// @notice Deploy and wire all modules using module defaults.
    /// @dev Mirrors module constants: 5% fee, 5% burn and a TOKEN_SCALE minimum stake.
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
    function deployDefaults(IdentityParams calldata ids, address governance)
        external
        onlyOwner
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
            address taxPolicy,
            address identityRegistryAddr,
            address systemPause
        )
    {
        EconParams memory econ;
        return _deploy(true, econ, ids, governance);
    }

    /// @notice Deploy and wire modules with defaults and no TaxPolicy.
    /// @dev Mirrors module constants: 5% fee, 5% burn and a TOKEN_SCALE minimum stake.
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
    function deployDefaultsWithoutTaxPolicy(
        IdentityParams calldata ids,
        address governance
    ) external onlyOwner returns (
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
            address taxPolicy,
            address identityRegistryAddr,
            address systemPause
        )
    {
        EconParams memory econ;
        return _deploy(false, econ, ids, governance);
    }

    function _deploy(
        bool withTaxPolicy,
        EconParams memory econ,
        IdentityParams memory ids,
        address governance
    ) internal returns (
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
            address taxPolicy,
            address identityRegistryAddr,
            address systemPause
        )
    {
        require(!deployed, "deployed");
        deployed = true;
        require(governance != address(0), "governance");

        uint256 feePct = econ.feePct == 0 ? 5 : econ.feePct;
        uint256 burnPct = econ.burnPct == 0 ? 5 : econ.burnPct;
        uint256 commitWindow =
            econ.commitWindow == 0 ? 1 days : econ.commitWindow;
        uint256 revealWindow =
            econ.revealWindow == 0 ? 1 days : econ.revealWindow;
        uint256 minStake = econ.minStake == 0 ? TOKEN_SCALE : econ.minStake;
        uint256 employerSlashPct = econ.employerSlashPct;
        uint256 treasurySlashPct = econ.treasurySlashPct;
        if (employerSlashPct + treasurySlashPct == 0) {
            treasurySlashPct = 100;
        }
        uint96 jobStake = econ.jobStake;
        StakeManager stake = new StakeManager(
            minStake,
            employerSlashPct,
            treasurySlashPct,
            governance,
            address(0),
            address(0),
            address(this)
        );
        address[] memory ackInit = new address[](1);
        ackInit[0] = address(stake);
        JobRegistry registry = new JobRegistry(
            IValidationModule(address(0)),
            IStakeManager(address(0)),
            JIReputationEngine(address(0)),
            JIDisputeModule(address(0)),
            JICertificateNFT(address(0)),
            IFeePool(address(0)),
            ITaxPolicy(address(0)),
            feePct,
            jobStake,
            ackInit,
            address(this)
        );

        ValidationModule validation = new ValidationModule(
            IJobRegistry(address(registry)),
            IStakeManager(address(stake)),
            commitWindow,
            revealWindow,
            0,
            0,
            new address[](0)
        );

        ReputationEngine reputation = new ReputationEngine(
            IStakeManager(address(stake))
        );

        DisputeModule dispute = new DisputeModule(
            IJobRegistry(address(registry)),
            0,
            0,
            address(0)
        );

        ArbitratorCommittee committee = new ArbitratorCommittee(
            IJobRegistry(address(registry)),
            IDisputeModule(address(dispute))
        );
        dispute.setCommittee(address(committee));

        CertificateNFT certificate = new CertificateNFT("Cert", "CERT");
        certificate.setJobRegistry(address(registry));

        TaxPolicy policy;
        if (withTaxPolicy) {
            policy = new TaxPolicy(
                "ipfs://policy",
                "All taxes on participants; contract and owner exempt"
            );
        }

        FeePool pool = new FeePool(
            IStakeManager(address(stake)),
            burnPct,
            address(0),
            ITaxPolicy(address(policy))
        );

        IdentityRegistry identity = new IdentityRegistry(
            ids.ens,
            ids.nameWrapper,
            IRInterface(address(reputation)),
            ids.agentRootNode,
            ids.clubRootNode
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

        // Wire modules
        address[] memory acks = new address[](0);
        registry.setModules(
            validation,
            IStakeManager(address(stake)),
            JIReputationEngine(address(reputation)),
            JIDisputeModule(address(dispute)),
            JICertificateNFT(address(certificate)),
            IFeePool(address(pool)),
            acks
        );
        if (address(policy) != address(0)) {
            registry.setTaxPolicy(ITaxPolicy(address(policy)));
        }

        registry.setIdentityRegistry(IIdentityRegistry(address(identity)));
        validation.setIdentityRegistry(IIdentityRegistry(address(identity)));
        if (ids.agentMerkleRoot != bytes32(0)) {
            identity.setAgentMerkleRoot(ids.agentMerkleRoot);
        }
        if (ids.validatorMerkleRoot != bytes32(0)) {
            identity.setValidatorMerkleRoot(ids.validatorMerkleRoot);
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
        reputation.setAuthorizedCaller(address(registry), true);
        reputation.setAuthorizedCaller(address(validation), true);

        SystemPause pause = new SystemPause(
            registry,
            stake,
            validation,
            dispute,
            pRegistry,
            pool,
            reputation,
            committee,
            governance
        );
        // hand over governance to SystemPause
        stake.setGovernance(address(pause));
        registry.setGovernance(address(pause));

        // Transfer ownership
        validation.transferOwnership(address(pause));
        reputation.transferOwnership(address(pause));
        dispute.transferOwnership(address(pause));
        committee.transferOwnership(address(pause));
        certificate.transferOwnership(governance);
        pRegistry.transferOwnership(address(pause));
        router.transferOwnership(governance);
        incentives.transferOwnership(governance);
        pool.transferOwnership(address(pause));
        if (address(policy) != address(0)) {
            policy.transferOwnership(governance);
        }
        identity.transferOwnership(governance);

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
            address(policy),
            address(identity),
            address(pause)
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
            address(policy),
            address(identity),
            address(pause)
        );
    }
}
