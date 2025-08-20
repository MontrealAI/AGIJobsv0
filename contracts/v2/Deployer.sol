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
import {ENSOwnershipVerifier} from "./modules/ENSOwnershipVerifier.sol";
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
import {IENS} from "./interfaces/IENS.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IReputationEngine as IRInterface} from "./interfaces/IReputationEngine.sol";

/// @title Deployer
/// @notice One shot helper that deploys and wires the core module set.
/// @dev Each module is deployed with default parameters (zero values) and
///      ownership is transferred to the caller once wiring is complete.
contract Deployer is Ownable {
    bool public deployed;

    constructor() Ownable(msg.sender) {}

    /// @notice Economic configuration applied during deployment.
    /// @dev Zero values use each module's baked-in default such as a 5% fee,
    ///      5% burn, 1-day commit/reveal windows and a 1e6 minimum stake.
    struct EconParams {
        IERC20 token; // custom token for StakeManager and FeePool (defaults to AGIALPHA)
        uint256 feePct; // protocol fee percentage for JobRegistry
        uint256 burnPct; // portion of fees burned by FeePool
        uint256 employerSlashPct; // slashed stake sent to employer
        uint256 treasurySlashPct; // slashed stake sent to treasury
        uint256 commitWindow; // validator commit window in seconds
        uint256 revealWindow; // validator reveal window in seconds
        uint256 minStake; // global minimum stake in StakeManager (6 decimals)
        uint96 jobStake; // minimum agent stake per job in JobRegistry (6 decimals)
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
        address ensVerifier
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

    function deploy(EconParams calldata econ, IdentityParams calldata ids)
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
            address ensVerifier
        )
    {
        return _deploy(true, econ, ids);
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
    function deployWithoutTaxPolicy(EconParams calldata econ, IdentityParams calldata ids)
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
            address ensVerifier
        )
    {
        return _deploy(false, econ, ids);
    }

    /// @notice Deploy and wire all modules using module defaults.
    /// @dev Mirrors module constants: 5% fee, 5% burn and a 1e6 minimum stake.
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
    function deployDefaults(IdentityParams calldata ids)
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
            address ensVerifier
        )
    {
        EconParams memory econ;
        return _deploy(true, econ, ids);
    }

    /// @notice Deploy and wire modules with defaults and no TaxPolicy.
    /// @dev Mirrors module constants: 5% fee, 5% burn and a 1e6 minimum stake.
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
    function deployDefaultsWithoutTaxPolicy(IdentityParams calldata ids)
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
            address ensVerifier
        )
    {
        EconParams memory econ;
        return _deploy(false, econ, ids);
    }

    function _deploy(bool withTaxPolicy, EconParams memory econ, IdentityParams memory ids)
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
            address taxPolicy,
            address ensVerifier
        )
    {
        require(!deployed, "deployed");
        deployed = true;
        address owner_ = owner();

        uint256 feePct = econ.feePct == 0 ? 5 : econ.feePct;
        uint256 burnPct = econ.burnPct == 0 ? 5 : econ.burnPct;
        uint256 commitWindow =
            econ.commitWindow == 0 ? 1 days : econ.commitWindow;
        uint256 revealWindow =
            econ.revealWindow == 0 ? 1 days : econ.revealWindow;
        uint256 minStake = econ.minStake == 0 ? 1e6 : econ.minStake;
        uint256 employerSlashPct = econ.employerSlashPct;
        uint256 treasurySlashPct = econ.treasurySlashPct;
        if (employerSlashPct + treasurySlashPct == 0) {
            treasurySlashPct = 100;
        }
        uint96 jobStake = econ.jobStake;
        IERC20 token = econ.token;

        StakeManager stake = new StakeManager(
            token,
            minStake,
            employerSlashPct,
            treasurySlashPct,
            owner_,
            address(0),
            address(0)
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
            IIdentityRegistry(address(0)),
            ITaxPolicy(address(0)),
            feePct,
            jobStake,
            ackInit
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
            owner_
        );

        CertificateNFT certificate = new CertificateNFT("Cert", "CERT");
        certificate.setJobRegistry(address(registry));

        FeePool pool = new FeePool(
            token,
            IStakeManager(address(stake)),
            burnPct,
            owner_
        );

        ENSOwnershipVerifier verifier = new ENSOwnershipVerifier(
            ids.ens,
            ids.nameWrapper,
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

        TaxPolicy policy;
        if (withTaxPolicy) {
            policy = new TaxPolicy(
                "ipfs://policy",
                "All taxes on participants; contract and owner exempt"
            );
        }

        // Wire modules
        address[] memory acks = new address[](2);
        acks[0] = address(pRegistry);
        acks[1] = address(incentives);
        registry.setModules(
            validation,
            IStakeManager(address(stake)),
            JIReputationEngine(address(reputation)),
            JIDisputeModule(address(dispute)),
            JICertificateNFT(address(certificate)),
            IIdentityRegistry(address(0)),
            acks
        );
        registry.setFeePool(IFeePool(address(pool)));
        if (address(policy) != address(0)) {
            registry.setTaxPolicy(ITaxPolicy(address(policy)));
        }

        validation.setENSOwnershipVerifier(verifier);
        if (ids.clubRootNode != bytes32(0)) {
            validation.setClubRootNode(ids.clubRootNode);
        }
        if (ids.nameWrapper != INameWrapper(address(0))) {
            validation.setNameWrapper(ids.nameWrapper);
        }
        if (ids.validatorMerkleRoot != bytes32(0)) {
            validation.setValidatorMerkleRoot(ids.validatorMerkleRoot);
        }
        if (ids.agentMerkleRoot != bytes32(0)) {
            validation.setAgentMerkleRoot(ids.agentMerkleRoot);
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

        // Transfer ownership
        registry.transferOwnership(owner_);
        stake.transferOwnership(owner_);
        validation.transferOwnership(owner_);
        reputation.transferOwnership(owner_);
        dispute.transferOwnership(owner_);
        certificate.transferOwnership(owner_);
        pRegistry.transferOwnership(owner_);
        router.transferOwnership(owner_);
        incentives.transferOwnership(owner_);
        pool.transferOwnership(owner_);
        if (address(policy) != address(0)) {
            policy.transferOwnership(owner_);
        }
        verifier.transferOwnership(owner_);

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
            address(verifier)
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
            address(verifier)
        );
    }
}
