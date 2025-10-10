// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {JobRegistry} from "./JobRegistry.sol";
import {StakeManager} from "./StakeManager.sol";
import {ValidationModule} from "./ValidationModule.sol";
import {DisputeModule} from "./modules/DisputeModule.sol";
import {PlatformRegistry} from "./PlatformRegistry.sol";
import {FeePool} from "./FeePool.sol";
import {ReputationEngine} from "./ReputationEngine.sol";
import {ArbitratorCommittee} from "./ArbitratorCommittee.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SystemPause
/// @notice Helper contract allowing governance to pause or unpause all core modules.
/// @dev Uses ReentrancyGuard to prevent reentrant pause/unpause cascades.
contract SystemPause is Governable, ReentrancyGuard {
    JobRegistry public jobRegistry;
    StakeManager public stakeManager;
    ValidationModule public validationModule;
    DisputeModule public disputeModule;
    PlatformRegistry public platformRegistry;
    FeePool public feePool;
    ReputationEngine public reputationEngine;
    ArbitratorCommittee public arbitratorCommittee;

    error InvalidJobRegistry(address module);
    error InvalidStakeManager(address module);
    error InvalidValidationModule(address module);
    error InvalidDisputeModule(address module);
    error InvalidPlatformRegistry(address module);
    error InvalidFeePool(address module);
    error InvalidReputationEngine(address module);
    error InvalidArbitratorCommittee(address module);
    error ModuleNotOwned(address module, address owner);

    event ModulesUpdated(
        address jobRegistry,
        address stakeManager,
        address validationModule,
        address disputeModule,
        address platformRegistry,
        address feePool,
        address reputationEngine,
        address arbitratorCommittee
    );

    event PausersUpdated(address indexed pauser);

    event ValidationFailoverForwarded(
        uint256 indexed jobId,
        ValidationModule.FailoverAction action,
        uint64 extension,
        string reason
    );

    constructor(
        JobRegistry _jobRegistry,
        StakeManager _stakeManager,
        ValidationModule _validationModule,
        DisputeModule _disputeModule,
        PlatformRegistry _platformRegistry,
        FeePool _feePool,
        ReputationEngine _reputationEngine,
        ArbitratorCommittee _arbitratorCommittee,
        address _governance
    ) Governable(_governance) {
        if (
            address(_jobRegistry) == address(0) ||
            address(_jobRegistry).code.length == 0
        ) revert InvalidJobRegistry(address(_jobRegistry));
        if (
            address(_stakeManager) == address(0) ||
            address(_stakeManager).code.length == 0
        ) revert InvalidStakeManager(address(_stakeManager));
        if (
            address(_validationModule) == address(0) ||
            address(_validationModule).code.length == 0
        ) revert InvalidValidationModule(address(_validationModule));
        if (
            address(_disputeModule) == address(0) ||
            address(_disputeModule).code.length == 0
        ) revert InvalidDisputeModule(address(_disputeModule));
        if (
            address(_platformRegistry) == address(0) ||
            address(_platformRegistry).code.length == 0
        ) revert InvalidPlatformRegistry(address(_platformRegistry));
        if (address(_feePool) == address(0) || address(_feePool).code.length == 0)
            revert InvalidFeePool(address(_feePool));
        if (
            address(_reputationEngine) == address(0) ||
            address(_reputationEngine).code.length == 0
        ) revert InvalidReputationEngine(address(_reputationEngine));
        if (
            address(_arbitratorCommittee) == address(0) ||
            address(_arbitratorCommittee).code.length == 0
        ) revert InvalidArbitratorCommittee(address(_arbitratorCommittee));

        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        validationModule = _validationModule;
        disputeModule = _disputeModule;
        platformRegistry = _platformRegistry;
        feePool = _feePool;
        reputationEngine = _reputationEngine;
        arbitratorCommittee = _arbitratorCommittee;
    }

    function setModules(
        JobRegistry _jobRegistry,
        StakeManager _stakeManager,
        ValidationModule _validationModule,
        DisputeModule _disputeModule,
        PlatformRegistry _platformRegistry,
        FeePool _feePool,
        ReputationEngine _reputationEngine,
        ArbitratorCommittee _arbitratorCommittee
    ) external onlyGovernance {
        if (
            address(_jobRegistry) == address(0) ||
            address(_jobRegistry).code.length == 0
        ) revert InvalidJobRegistry(address(_jobRegistry));
        if (
            address(_stakeManager) == address(0) ||
            address(_stakeManager).code.length == 0
        ) revert InvalidStakeManager(address(_stakeManager));
        if (
            address(_validationModule) == address(0) ||
            address(_validationModule).code.length == 0
        ) revert InvalidValidationModule(address(_validationModule));
        if (
            address(_disputeModule) == address(0) ||
            address(_disputeModule).code.length == 0
        ) revert InvalidDisputeModule(address(_disputeModule));
        if (
            address(_platformRegistry) == address(0) ||
            address(_platformRegistry).code.length == 0
        ) revert InvalidPlatformRegistry(address(_platformRegistry));
        if (address(_feePool) == address(0) || address(_feePool).code.length == 0)
            revert InvalidFeePool(address(_feePool));
        if (
            address(_reputationEngine) == address(0) ||
            address(_reputationEngine).code.length == 0
        ) revert InvalidReputationEngine(address(_reputationEngine));
        if (
            address(_arbitratorCommittee) == address(0) ||
            address(_arbitratorCommittee).code.length == 0
        ) revert InvalidArbitratorCommittee(address(_arbitratorCommittee));

        _requireModuleOwnership(
            _jobRegistry,
            _stakeManager,
            _validationModule,
            _disputeModule,
            _platformRegistry,
            _feePool,
            _reputationEngine,
            _arbitratorCommittee
        );

        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        validationModule = _validationModule;
        disputeModule = _disputeModule;
        platformRegistry = _platformRegistry;
        feePool = _feePool;
        reputationEngine = _reputationEngine;
        arbitratorCommittee = _arbitratorCommittee;

        _setPausers(address(this));

        emit ModulesUpdated(
            address(_jobRegistry),
            address(_stakeManager),
            address(_validationModule),
            address(_disputeModule),
            address(_platformRegistry),
            address(_feePool),
            address(_reputationEngine),
            address(_arbitratorCommittee)
        );
    }

    /// @notice Re-assign SystemPause as the pauser for all managed modules.
    /// @dev Requires ownership of each module to have been transferred to this contract.
    function refreshPausers() external onlyGovernance {
        _requireModuleOwnership(
            jobRegistry,
            stakeManager,
            validationModule,
            disputeModule,
            platformRegistry,
            feePool,
            reputationEngine,
            arbitratorCommittee
        );

        _setPausers(address(this));
    }

    /// @notice Set a custom pauser address across all managed modules.
    /// @param pauser The address empowered to pause and unpause the modules.
    function setGlobalPauser(address pauser) external onlyGovernance {
        _requireModuleOwnership(
            jobRegistry,
            stakeManager,
            validationModule,
            disputeModule,
            platformRegistry,
            feePool,
            reputationEngine,
            arbitratorCommittee
        );

        _setPausers(pauser);
    }

    /// @notice Pause all core modules.
    function pauseAll() external onlyGovernance nonReentrant {
        jobRegistry.pause();
        stakeManager.pause();
        validationModule.pause();
        disputeModule.pause();
        platformRegistry.pause();
        feePool.pause();
        reputationEngine.pause();
        arbitratorCommittee.pause();
    }

    /// @notice Unpause all core modules.
    function unpauseAll() external onlyGovernance nonReentrant {
        jobRegistry.unpause();
        stakeManager.unpause();
        validationModule.unpause();
        disputeModule.unpause();
        platformRegistry.unpause();
        feePool.unpause();
        reputationEngine.unpause();
        arbitratorCommittee.unpause();
    }

    /// @notice Forward a validation failover instruction to the ValidationModule.
    /// @param jobId Identifier of the job being adjusted.
    /// @param action Failover action (extend reveal window or escalate dispute).
    /// @param extension Additional seconds appended to the reveal window when extending.
    /// @param reason Context string recorded for monitoring.
    function triggerValidationFailover(
        uint256 jobId,
        ValidationModule.FailoverAction action,
        uint64 extension,
        string calldata reason
    ) external onlyGovernance {
        validationModule.triggerFailover(jobId, action, extension, reason);
        emit ValidationFailoverForwarded(jobId, action, extension, reason);
    }

    function _setPausers(address pauser) internal {
        jobRegistry.setPauser(pauser);
        stakeManager.setPauser(pauser);
        validationModule.setPauser(pauser);
        disputeModule.setPauser(pauser);
        platformRegistry.setPauser(pauser);
        feePool.setPauser(pauser);
        reputationEngine.setPauser(pauser);
        arbitratorCommittee.setPauser(pauser);

        emit PausersUpdated(pauser);
    }

    function _requireModuleOwnership(
        JobRegistry _jobRegistry,
        StakeManager _stakeManager,
        ValidationModule _validationModule,
        DisputeModule _disputeModule,
        PlatformRegistry _platformRegistry,
        FeePool _feePool,
        ReputationEngine _reputationEngine,
        ArbitratorCommittee _arbitratorCommittee
    ) internal view {
        if (_jobRegistry.owner() != address(this)) {
            revert ModuleNotOwned(address(_jobRegistry), _jobRegistry.owner());
        }
        if (_stakeManager.owner() != address(this)) {
            revert ModuleNotOwned(address(_stakeManager), _stakeManager.owner());
        }
        if (_validationModule.owner() != address(this)) {
            revert ModuleNotOwned(address(_validationModule), _validationModule.owner());
        }
        if (_disputeModule.owner() != address(this)) {
            revert ModuleNotOwned(address(_disputeModule), _disputeModule.owner());
        }
        if (_platformRegistry.owner() != address(this)) {
            revert ModuleNotOwned(
                address(_platformRegistry),
                _platformRegistry.owner()
            );
        }
        if (_feePool.owner() != address(this)) {
            revert ModuleNotOwned(address(_feePool), _feePool.owner());
        }
        if (_reputationEngine.owner() != address(this)) {
            revert ModuleNotOwned(
                address(_reputationEngine),
                _reputationEngine.owner()
            );
        }
        if (_arbitratorCommittee.owner() != address(this)) {
            revert ModuleNotOwned(
                address(_arbitratorCommittee),
                _arbitratorCommittee.owner()
            );
        }
    }
}

