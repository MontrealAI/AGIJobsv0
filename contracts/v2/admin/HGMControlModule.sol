// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable2Step} from "../utils/Ownable2Step.sol";
import {IJobRegistryControl} from "../interfaces/IJobRegistryControl.sol";
import {IStakeManagerControl} from "../interfaces/IStakeManagerControl.sol";
import {ISystemPauseControl} from "../interfaces/ISystemPauseControl.sol";
import {IPlatformRegistryControl} from "../interfaces/IPlatformRegistryControl.sol";
import {IReputationEngineControl} from "../interfaces/IReputationEngineControl.sol";
import {IFeePool} from "../interfaces/IFeePool.sol";
import {ITaxPolicy} from "../interfaces/ITaxPolicy.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";

/// @title HGMControlModule
/// @notice Governance-owned facade that centralises operational controls for
///         the Huxley–Gödel Machine (HGM) deployment of AGI Jobs v0. The module
///         consolidates pausing, parameter updates, and registry metadata
///         mutations behind a single `Ownable2Step` surface so that multisigs or
///         timelocks only need to delegate access once. Each function fan-outs
///         to the underlying production contracts without re-implementing their
///         business logic.
contract HGMControlModule is Ownable2Step {
    /// @notice Container for the addresses that the module orchestrates.
    struct ControlTargets {
        address jobRegistry;
        address stakeManager;
        address systemPause;
        address platformRegistry;
        address reputationEngine;
    }

    /// @notice Batch economic tweaks applied to the JobRegistry.
    struct JobEconomics {
        bool setJobStake;
        uint96 jobStake;
        bool setMinAgentStake;
        uint256 minAgentStake;
        bool setFeePct;
        uint256 feePct;
        bool setValidatorRewardPct;
        uint256 validatorRewardPct;
        bool setMaxJobReward;
        uint256 maxJobReward;
        bool setJobDurationLimit;
        uint256 jobDurationLimit;
        bool setMaxActiveJobsPerAgent;
        uint256 maxActiveJobsPerAgent;
        bool setExpirationGracePeriod;
        uint256 expirationGracePeriod;
    }

    /// @notice Job registry metadata and access configuration toggles.
    struct JobAccess {
        bool setAgentRootNode;
        bytes32 agentRootNode;
        bool setAgentMerkleRoot;
        bytes32 agentMerkleRoot;
        bool setValidatorRootNode;
        bytes32 validatorRootNode;
        bool setValidatorMerkleRoot;
        bytes32 validatorMerkleRoot;
        bool bumpAgentAuthCacheVersion;
        bool setAgentAuthCacheDuration;
        uint256 agentAuthCacheDuration;
    }

    /// @notice Funding rails shared between the registry and stake manager.
    struct JobFunding {
        bool setFeePool;
        address feePool;
        bool setTreasury;
        address treasury;
        bool setTaxPolicy;
        ITaxPolicy taxPolicy;
    }

    /// @notice StakeManager configuration bundle.
    struct StakeManagerConfig {
        bool setFeePct;
        uint256 feePct;
        bool setBurnPct;
        uint256 burnPct;
        bool setValidatorRewardPct;
        uint256 validatorRewardPct;
        bool setMinStake;
        uint256 minStake;
        bool setMaxStakePerAddress;
        uint256 maxStakePerAddress;
        bool setUnbondingPeriod;
        uint256 unbondingPeriod;
        bool setFeePool;
        address feePool;
        bool setTreasury;
        address treasury;
        address[] treasuryAllowlist;
        bool[] treasuryAllowlistStatus;
    }

    /// @notice Coordinated pauser assignments across the control plane.
    struct PauserConfig {
        bool setJobRegistryPauserManager;
        address jobRegistryPauserManager;
        bool setStakeManagerPauserManager;
        address stakeManagerPauserManager;
        bool setSystemPauseGlobalPauser;
        address systemPauseGlobalPauser;
        bool refreshSystemPause;
        bool setPlatformRegistryPauser;
        address platformRegistryPauser;
        bool setPlatformRegistryPauserManager;
        address platformRegistryPauserManager;
        bool setReputationEnginePauser;
        address reputationEnginePauser;
        bool setReputationEnginePauserManager;
        address reputationEnginePauserManager;
    }

    /// @notice Reputation engine tuning and authorisation controls.
    struct ReputationConfig {
        bool setScoringWeights;
        uint256 stakeWeight;
        uint256 reputationWeight;
        bool setPremiumThreshold;
        uint256 premiumThreshold;
        bool setValidationRewardPercentage;
        uint256 validationRewardPercentage;
        bool setStakeManager;
        address stakeManager;
        address[] addCallers;
        address[] removeCallers;
        address[] blacklist;
        bool[] blacklistStatus;
        bool setPauser;
        address pauser;
        bool setPauserManager;
        address pauserManager;
    }

    IJobRegistryControl public jobRegistry;
    IStakeManagerControl public stakeManager;
    ISystemPauseControl public systemPause;
    IPlatformRegistryControl public platformRegistry;
    IReputationEngineControl public reputationEngine;

    event ControlTargetsUpdated(
        address jobRegistry,
        address stakeManager,
        address systemPause,
        address platformRegistry,
        address reputationEngine
    );

    event SystemPaused(address indexed actor);
    event SystemUnpaused(address indexed actor);
    event JobEconomicsConfigured(JobEconomics config, address indexed actor);
    event JobAccessConfigured(JobAccess config, address indexed actor);
    event JobFundingConfigured(address feePool, address treasury, address taxPolicy, address indexed actor);
    event StakeManagerConfigured(StakeManagerConfig config, uint256 allowlistUpdates, address indexed actor);
    event PausersUpdated(PauserConfig config, address indexed actor);
    event PlatformRegistryConfigured(
        uint256 registrarUpdates,
        uint256 blacklistUpdates,
        bool pauserUpdated,
        bool pauserManagerUpdated,
        address indexed actor
    );
    event ReputationEngineConfigured(
        ReputationConfig config,
        uint256 callersAdded,
        uint256 callersRemoved,
        uint256 blacklistUpdates,
        address indexed actor
    );

    error ControlTargetUnset(bytes32 key);
    error ArrayLengthMismatch();

    constructor(ControlTargets memory targets, address initialOwner)
        Ownable2Step(initialOwner == address(0) ? msg.sender : initialOwner)
    {
        _setControlTargets(targets);
    }

    // ---------------------------------------------------------------------
    // Control surface
    // ---------------------------------------------------------------------

    function pauseSystem() external onlyOwner {
        ISystemPauseControl pauseContract = _requireSystemPause();
        pauseContract.pauseAll();
        emit SystemPaused(_msgSender());
    }

    function resumeSystem() external onlyOwner {
        ISystemPauseControl pauseContract = _requireSystemPause();
        pauseContract.unpauseAll();
        emit SystemUnpaused(_msgSender());
    }

    function updateControlTargets(ControlTargets calldata targets) external onlyOwner {
        _setControlTargets(targets);
    }

    function updateJobEconomics(JobEconomics calldata config) external onlyOwner {
        IJobRegistryControl registry = _requireJobRegistry();

        if (config.setJobStake) {
            registry.setJobStake(config.jobStake);
        }
        if (config.setMinAgentStake) {
            registry.setMinAgentStake(config.minAgentStake);
        }
        if (config.setFeePct) {
            registry.setFeePct(config.feePct);
        }
        if (config.setValidatorRewardPct) {
            registry.setValidatorRewardPct(config.validatorRewardPct);
        }
        if (config.setMaxJobReward) {
            registry.setMaxJobReward(config.maxJobReward);
        }
        if (config.setJobDurationLimit) {
            registry.setJobDurationLimit(config.jobDurationLimit);
        }
        if (config.setMaxActiveJobsPerAgent) {
            registry.setMaxActiveJobsPerAgent(config.maxActiveJobsPerAgent);
        }
        if (config.setExpirationGracePeriod) {
            registry.setExpirationGracePeriod(config.expirationGracePeriod);
        }

        emit JobEconomicsConfigured(config, _msgSender());
    }

    function updateJobAccess(JobAccess calldata config) external onlyOwner {
        IJobRegistryControl registry = _requireJobRegistry();

        if (config.setAgentRootNode) {
            registry.setAgentRootNode(config.agentRootNode);
        }
        if (config.setAgentMerkleRoot) {
            registry.setAgentMerkleRoot(config.agentMerkleRoot);
        }
        if (config.setValidatorRootNode) {
            registry.setValidatorRootNode(config.validatorRootNode);
        }
        if (config.setValidatorMerkleRoot) {
            registry.setValidatorMerkleRoot(config.validatorMerkleRoot);
        }
        if (config.bumpAgentAuthCacheVersion) {
            registry.bumpAgentAuthCacheVersion();
        }
        if (config.setAgentAuthCacheDuration) {
            registry.setAgentAuthCacheDuration(config.agentAuthCacheDuration);
        }

        emit JobAccessConfigured(config, _msgSender());
    }

    function updateJobFunding(JobFunding calldata config) external onlyOwner {
        IJobRegistryControl registry = _requireJobRegistry();
        IStakeManagerControl stake = _requireStakeManager();

        if (config.setFeePool) {
            registry.setFeePool(config.feePool);
            stake.setFeePool(IFeePool(config.feePool));
        }
        if (config.setTreasury) {
            registry.setTreasury(config.treasury);
            stake.setTreasury(config.treasury);
        }
        if (config.setTaxPolicy) {
            registry.setTaxPolicy(config.taxPolicy);
        }

        emit JobFundingConfigured(
            config.setFeePool ? config.feePool : address(0),
            config.setTreasury ? config.treasury : address(0),
            config.setTaxPolicy ? address(config.taxPolicy) : address(0),
            _msgSender()
        );
    }

    function configureStakeManager(StakeManagerConfig calldata config) external onlyOwner {
        IStakeManagerControl stake = _requireStakeManager();

        if (config.setFeePct) {
            stake.setFeePct(config.feePct);
        }
        if (config.setBurnPct) {
            stake.setBurnPct(config.burnPct);
        }
        if (config.setValidatorRewardPct) {
            stake.setValidatorRewardPct(config.validatorRewardPct);
        }
        if (config.setMinStake) {
            stake.setMinStake(config.minStake);
        }
        if (config.setMaxStakePerAddress) {
            stake.setMaxStakePerAddress(config.maxStakePerAddress);
        }
        if (config.setUnbondingPeriod) {
            stake.setUnbondingPeriod(config.unbondingPeriod);
        }
        if (config.setFeePool) {
            stake.setFeePool(IFeePool(config.feePool));
        }
        if (config.setTreasury) {
            stake.setTreasury(config.treasury);
        }

        uint256 updates = config.treasuryAllowlist.length;
        if (updates != config.treasuryAllowlistStatus.length) {
            revert ArrayLengthMismatch();
        }

        for (uint256 i; i < updates; i++) {
            stake.setTreasuryAllowlist(
                config.treasuryAllowlist[i],
                config.treasuryAllowlistStatus[i]
            );
        }

        emit StakeManagerConfigured(config, updates, _msgSender());
    }

    function configurePausers(PauserConfig calldata config) external onlyOwner {
        IJobRegistryControl registry = _requireJobRegistry();
        IStakeManagerControl stake = _requireStakeManager();
        ISystemPauseControl pauseContract = _requireSystemPause();

        if (config.setJobRegistryPauserManager) {
            registry.setPauserManager(config.jobRegistryPauserManager);
        }
        if (config.setStakeManagerPauserManager) {
            stake.setPauserManager(config.stakeManagerPauserManager);
        }
        if (config.setSystemPauseGlobalPauser) {
            pauseContract.setGlobalPauser(config.systemPauseGlobalPauser);
        }
        if (config.refreshSystemPause) {
            pauseContract.refreshPausers();
        }

        if (config.setPlatformRegistryPauser || config.setPlatformRegistryPauserManager) {
            IPlatformRegistryControl platformCtrl = _requirePlatformRegistry();
            if (config.setPlatformRegistryPauser) {
                platformCtrl.setPauser(config.platformRegistryPauser);
            }
            if (config.setPlatformRegistryPauserManager) {
                platformCtrl.setPauserManager(config.platformRegistryPauserManager);
            }
        }

        if (config.setReputationEnginePauser || config.setReputationEnginePauserManager) {
            IReputationEngineControl reputationCtrl = _requireReputationEngine();
            if (config.setReputationEnginePauser) {
                reputationCtrl.setPauser(config.reputationEnginePauser);
            }
            if (config.setReputationEnginePauserManager) {
                reputationCtrl.setPauserManager(config.reputationEnginePauserManager);
            }
        }

        emit PausersUpdated(config, _msgSender());
    }

    function configurePlatformRegistry(
        IPlatformRegistryControl.ConfigUpdate calldata config,
        IPlatformRegistryControl.RegistrarConfig[] calldata registrarUpdates,
        IPlatformRegistryControl.BlacklistConfig[] calldata blacklistUpdates
    ) external onlyOwner {
        IPlatformRegistryControl platformCtrl = _requirePlatformRegistry();
        platformCtrl.applyConfiguration(config, registrarUpdates, blacklistUpdates);
        emit PlatformRegistryConfigured(
            registrarUpdates.length,
            blacklistUpdates.length,
            config.setPauser,
            config.setPauserManager,
            _msgSender()
        );
    }

    function configureReputationEngine(ReputationConfig calldata config) external onlyOwner {
        IReputationEngineControl reputationCtrl = _requireReputationEngine();

        if (config.setScoringWeights) {
            reputationCtrl.setScoringWeights(config.stakeWeight, config.reputationWeight);
        }
        if (config.setPremiumThreshold) {
            reputationCtrl.setPremiumThreshold(config.premiumThreshold);
        }
        if (config.setValidationRewardPercentage) {
            reputationCtrl.setValidationRewardPercentage(config.validationRewardPercentage);
        }
        if (config.setStakeManager) {
            reputationCtrl.setStakeManager(IStakeManager(config.stakeManager));
        }
        if (config.setPauser) {
            reputationCtrl.setPauser(config.pauser);
        }
        if (config.setPauserManager) {
            reputationCtrl.setPauserManager(config.pauserManager);
        }

        uint256 callersAdded = config.addCallers.length;
        for (uint256 i; i < callersAdded; i++) {
            reputationCtrl.setCaller(config.addCallers[i], true);
        }

        uint256 callersRemoved = config.removeCallers.length;
        for (uint256 i; i < callersRemoved; i++) {
            reputationCtrl.setCaller(config.removeCallers[i], false);
        }

        uint256 blacklistUpdates = config.blacklist.length;
        if (blacklistUpdates != config.blacklistStatus.length) {
            revert ArrayLengthMismatch();
        }
        for (uint256 i; i < blacklistUpdates; i++) {
            reputationCtrl.setBlacklist(config.blacklist[i], config.blacklistStatus[i]);
        }

        emit ReputationEngineConfigured(
            config,
            callersAdded,
            callersRemoved,
            blacklistUpdates,
            _msgSender()
        );
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _setControlTargets(ControlTargets memory targets) internal {
        if (targets.jobRegistry == address(0)) revert ControlTargetUnset("JOB_REGISTRY");
        if (targets.stakeManager == address(0)) revert ControlTargetUnset("STAKE_MANAGER");
        if (targets.systemPause == address(0)) revert ControlTargetUnset("SYSTEM_PAUSE");
        if (targets.platformRegistry == address(0)) revert ControlTargetUnset("PLATFORM_REGISTRY");
        if (targets.reputationEngine == address(0)) revert ControlTargetUnset("REPUTATION_ENGINE");

        jobRegistry = IJobRegistryControl(targets.jobRegistry);
        stakeManager = IStakeManagerControl(targets.stakeManager);
        systemPause = ISystemPauseControl(targets.systemPause);
        platformRegistry = IPlatformRegistryControl(targets.platformRegistry);
        reputationEngine = IReputationEngineControl(targets.reputationEngine);

        emit ControlTargetsUpdated(
            targets.jobRegistry,
            targets.stakeManager,
            targets.systemPause,
            targets.platformRegistry,
            targets.reputationEngine
        );
    }

    function _requireJobRegistry() internal view returns (IJobRegistryControl registry) {
        registry = jobRegistry;
        if (address(registry) == address(0)) {
            revert ControlTargetUnset("JOB_REGISTRY");
        }
    }

    function _requireStakeManager() internal view returns (IStakeManagerControl stake) {
        stake = stakeManager;
        if (address(stake) == address(0)) {
            revert ControlTargetUnset("STAKE_MANAGER");
        }
    }

    function _requireSystemPause() internal view returns (ISystemPauseControl pauseContract) {
        pauseContract = systemPause;
        if (address(pauseContract) == address(0)) {
            revert ControlTargetUnset("SYSTEM_PAUSE");
        }
    }

    function _requirePlatformRegistry()
        internal
        view
        returns (IPlatformRegistryControl platformCtrl)
    {
        platformCtrl = platformRegistry;
        if (address(platformCtrl) == address(0)) {
            revert ControlTargetUnset("PLATFORM_REGISTRY");
        }
    }

    function _requireReputationEngine()
        internal
        view
        returns (IReputationEngineControl reputationCtrl)
    {
        reputationCtrl = reputationEngine;
        if (address(reputationCtrl) == address(0)) {
            revert ControlTargetUnset("REPUTATION_ENGINE");
        }
    }
}
