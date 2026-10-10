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
/// @notice Finalizes a staged deployment and atomically wires the core module set.
/// @dev Modules are deployed separately, registered by the owner, and their
///      ownership is transferred to the supplied governance address once
///      wiring is complete.
contract Deployer is Ownable {
    bool public deployed;
    mapping(bytes32 => address) public components;
    mapping(bytes32 => bytes32) public componentCodeHashes;
    event ComponentDeployed(bytes32 indexed componentId, address indexed component, bytes32 creationCodeHash);

    /// @notice Deploy one component per transaction, recording it for safe resumption.
    /// @dev Controllers are paused atomically at creation until final wiring succeeds.
    function deployComponent(bytes32 componentId, bytes calldata creationCode, bool pauseUntilWired)
        external
        onlyOwner
        returns (address component)
    {
        require(!registered && !deployed, "registered");
        require(componentId != bytes32(0), "component id");
        require(creationCode.length != 0 && creationCode.length <= 49152, "initcode size");
        bytes32 codeHash = keccak256(creationCode);
        component = components[componentId];
        if (component != address(0)) {
            require(componentCodeHashes[componentId] == codeHash, "component configuration");
            return component;
        }
        bytes memory code = creationCode;
        assembly ("memory-safe") { component := create(0, add(code, 32), mload(code)) }
        require(component != address(0) && component.code.length != 0, "component deployment");
        if (pauseUntilWired) {
            (bool ok, bytes memory reason) = component.call(abi.encodeWithSignature("pause()"));
            if (!ok) assembly ("memory-safe") { revert(add(reason, 32), mload(reason)) }
        }
        components[componentId] = component;
        componentCodeHashes[componentId] = codeHash;
        emit ComponentDeployed(componentId, component, codeHash);
    }

    /// @dev Order matches Deployed, followed by ArbitratorCommittee. The pause controller is index 12.
    address[14] private _staged;
    bool public registered;
    /// @notice Optional reviewed-plan commitment used by the staged deployment CLI.
    /// @dev Immutable once recorded; legacy entrypoints remain available.
    bytes32 public configurationHash;
    bool private _launchPaused;
    event ConfigurationCommitted(bytes32 indexed configurationHash);

    function commitConfiguration(bytes32 digest) external onlyOwner {
        require(digest != bytes32(0), "configuration hash");
        if (configurationHash != bytes32(0)) {
            require(configurationHash == digest, "configuration changed");
            return;
        }
        require(!registered && !deployed, "registered");
        configurationHash = digest;
        emit ConfigurationCommitted(digest);
    }
    error InvalidStagedModule(uint256 index, address module);
    error ModulesNotRegistered();
    event ModulesRegistered(address[14] modules);

    /// @notice Register a complete, separately deployed stack exactly once.
    /// @dev All modules except SystemPause must be controlled by this coordinator.
    ///      Two-step ownership transfers are accepted in this transaction.
    function registerModules(address[14] calldata modules) external onlyOwner {
        require(!registered && !deployed, "registered");
        if (modules[10] != address(0) && TaxPolicy(payable(modules[10])).pendingOwner() == address(this)) {
            TaxPolicy(payable(modules[10])).acceptOwnership();
        }
        if (modules[11] != address(0) && IdentityRegistry(payable(modules[11])).pendingOwner() == address(this)) {
            IdentityRegistry(payable(modules[11])).acceptOwnership();
        }
        for (uint256 i; i < modules.length; ++i) {
            if (i == 10 && modules[i] == address(0)) continue;
            if (modules[i].code.length == 0) revert InvalidStagedModule(i, modules[i]);
            for (uint256 j; j < i; ++j) {
                if (modules[i] == modules[j]) revert InvalidStagedModule(i, modules[i]);
            }
            if (i != 12 && Ownable(modules[i]).owner() != address(this)) {
                revert InvalidStagedModule(i, modules[i]);
            }
        }
        _staged = modules;
        registered = true;
        emit ModulesRegistered(modules);
    }

    function stagedModules() external view returns (address[14] memory) {
        return _staged;
    }

    constructor() Ownable(msg.sender) {}

    /// @notice Economic configuration applied during deployment.
    /// @dev Zero values use each module's baked-in default such as a 5% fee,
    ///      1% burn, 1-day commit/reveal windows and a TOKEN_SCALE minimum stake.
    struct EconParams {
        uint256 feePct; // protocol fee percentage for JobRegistry
        uint256 burnPct; // portion of fees burned by FeePool
        uint256 employerSlashPct; // slashed stake sent to employer
        uint256 treasurySlashPct; // slashed stake sent to treasury
        uint256 validatorSlashRewardPct; // slashed stake distributed to validators
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

    function deploy(EconParams calldata econ, IdentityParams calldata ids, address governance)
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
        _checkDeploymentMode(true);
        return _deploy(econ, ids, governance);
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
    function deployWithoutTaxPolicy(EconParams calldata econ, IdentityParams calldata ids, address governance)
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
        _checkDeploymentMode(false);
        return _deploy(econ, ids, governance);
    }

    /// @notice Deploy and wire all modules using module defaults.
    /// @dev Mirrors module constants: 5% fee, 1% burn and a TOKEN_SCALE minimum stake.
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
        _checkDeploymentMode(true);
        return _deploy(econ, ids, governance);
    }

    /// @notice Deploy and wire modules with defaults and no TaxPolicy.
    /// @dev Mirrors module constants: 5% fee, 1% burn and a TOKEN_SCALE minimum stake.
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
    function deployDefaultsWithoutTaxPolicy(IdentityParams calldata ids, address governance)
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
        _checkDeploymentMode(false);
        return _deploy(econ, ids, governance);
    }

    /// @notice Wire the stack and transfer ownership with every managed module paused.
    /// @dev Recommended for new deployments. Governance must complete commissioning
    ///      before calling SystemPause.unpauseAll(). Existing entrypoints retain
    ///      their historical unpaused behavior for compatibility.
    function deployPaused(
        EconParams calldata econ,
        IdentityParams calldata ids,
        address governance,
        bool withTaxPolicy
    ) external onlyOwner {
        _checkDeploymentMode(withTaxPolicy);
        _launchPaused = true;
        _deploy(econ, ids, governance);
    }

    // Keep mode checks outside the common wiring routine so viaIR does not
    // specialize and duplicate the complete deployment body for each mode.
    function _checkDeploymentMode(bool withTaxPolicy) private view {
        require(!deployed, "deployed");
        if (!registered) revert ModulesNotRegistered();
        require(withTaxPolicy == (_staged[10] != address(0)), "tax policy mode");
    }

    function _deploy(EconParams memory econ, IdentityParams memory ids, address governance)
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
            address identityRegistryAddr,
            address systemPause
        )
    {
        require(!deployed, "deployed");
        if (!registered) revert ModulesNotRegistered();
        deployed = true;
        require(governance != address(0), "governance");

        uint256 feePct = econ.feePct == 0 ? 5 : econ.feePct;
        uint256 burnPct = econ.burnPct == 0 ? 1 : econ.burnPct;
        uint256 commitWindow = econ.commitWindow == 0 ? 1 days : econ.commitWindow;
        uint256 revealWindow = econ.revealWindow == 0 ? 1 days : econ.revealWindow;
        uint256 minStake = econ.minStake == 0 ? TOKEN_SCALE : econ.minStake;
        uint256 employerSlashPct = econ.employerSlashPct;
        uint256 treasurySlashPct = econ.treasurySlashPct;
        uint256 validatorSlashPct = econ.validatorSlashRewardPct;
        uint256 slashTotal = employerSlashPct + treasurySlashPct + validatorSlashPct;
        if (slashTotal == 0) {
            treasurySlashPct = 100;
        } else {
            require(slashTotal <= 100, "invalid slash split");
        }
        uint96 jobStake = econ.jobStake;
        StakeManager stake = StakeManager(payable(payable(_staged[0])));
        JobRegistry registry = JobRegistry(payable(payable(_staged[1])));
        ValidationModule validation = ValidationModule(payable(payable(_staged[2])));
        ReputationEngine reputation = ReputationEngine(payable(_staged[3]));
        DisputeModule dispute = DisputeModule(payable(payable(_staged[4])));
        CertificateNFT certificate = CertificateNFT(payable(_staged[5]));
        PlatformRegistry pRegistry = PlatformRegistry(payable(_staged[6]));
        JobRouter router = JobRouter(payable(_staged[7]));
        PlatformIncentives incentives = PlatformIncentives(payable(_staged[8]));
        FeePool pool = FeePool(payable(payable(_staged[9])));
        TaxPolicy policy = TaxPolicy(payable(_staged[10]));
        IdentityRegistry identity = IdentityRegistry(payable(_staged[11]));
        SystemPause pause = SystemPause(payable(_staged[12]));
        ArbitratorCommittee committee = ArbitratorCommittee(payable(_staged[13]));
        require(pause.owner() == governance, "pause governance");
        require(
            address(pause.jobRegistry()) == address(registry) && address(pause.stakeManager()) == address(stake)
                && address(pause.validationModule()) == address(validation)
                && address(pause.disputeModule()) == address(dispute)
                && address(pause.platformRegistry()) == address(pRegistry) && address(pause.feePool()) == address(pool)
                && address(pause.reputationEngine()) == address(reputation)
                && address(pause.arbitratorCommittee()) == address(committee),
            "pause modules"
        );
        stake.setMinStake(minStake);
        require(stake.minStakeFloor() == minStake, "initial minimum stake");
        stake.setSlashingPercentages(employerSlashPct, treasurySlashPct);
        if (validatorSlashPct != 0) stake.setValidatorSlashRewardPct(validatorSlashPct);
        stake.setTreasuryAllowlist(governance, true);
        stake.setTreasury(governance);
        registry.setFeePct(feePct);
        registry.setJobStake(jobStake == 0 ? registry.DEFAULT_JOB_STAKE() : jobStake);
        registry.setAcknowledger(address(stake), true);
        validation.setTiming(commitWindow, revealWindow);
        pool.setBurnPct(burnPct);
        committee.setDisputeModule(IDisputeModule(address(dispute)));
        certificate.setJobRegistry(address(registry));
        certificate.setStakeManager(address(stake));
        dispute.setStakeManager(IStakeManager(address(stake)));
        require(
            address(identity.ens()) == address(ids.ens) && address(identity.nameWrapper()) == address(ids.nameWrapper)
                && identity.agentRootNode() == ids.agentRootNode && identity.clubRootNode() == ids.clubRootNode,
            "identity configuration"
        );
        IRInterface repInterface = IRInterface(address(reputation));

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
            policy.setAcknowledger(address(registry), true);
            registry.setTaxPolicy(ITaxPolicy(address(policy)));
            dispute.setTaxPolicy(ITaxPolicy(address(policy)));
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
        stake.setValidationModule(address(validation));
        stake.setFeePool(IFeePool(address(pool)));
        incentives.setModules(
            IStakeManager(address(stake)), IPlatformRegistryFull(address(pRegistry)), IJobRouter(address(router))
        );
        pRegistry.setRegistrar(address(incentives), true);
        router.setRegistrar(address(incentives), true);
        reputation.setAuthorizedCaller(address(registry), true);
        reputation.setAuthorizedCaller(address(validation), true);

        if (_launchPaused) {
            // Registration also supports externally staged modules. Check state
            // before pausing so both staged paths have the same atomic outcome.
            if (!registry.paused()) registry.pause();
            if (!stake.paused()) stake.pause();
            if (!validation.paused()) validation.pause();
            if (!dispute.paused()) dispute.pause();
            if (!pRegistry.paused()) pRegistry.pause();
            if (!pool.paused()) pool.pause();
            if (!reputation.paused()) reputation.pause();
            if (!committee.paused()) committee.pause();
        } else {
            registry.unpause();
            stake.unpause();
            validation.unpause();
        }

        // Transfer governance/ownership through the common Ownable-compatible surface.
        // IdentityRegistry and TaxPolicy retain their two-step acceptance requirements.
        for (uint256 i; i < _staged.length; ++i) {
            if (i == 12 || _staged[i] == address(0)) continue;
            address destination = (i == 0 || i == 1 || i == 2 || i == 3 || i == 4 || i == 6 || i == 9 || i == 13)
                ? address(pause)
                : governance;
            Ownable(_staged[i]).transferOwnership(destination);
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
