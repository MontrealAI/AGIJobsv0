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

    /// @notice Tracks the currently delegated pauser address used across all modules.
    address public activePauser;

    error InvalidJobRegistry(address module);
    error InvalidStakeManager(address module);
    error InvalidValidationModule(address module);
    error InvalidDisputeModule(address module);
    error InvalidPlatformRegistry(address module);
    error InvalidFeePool(address module);
    error InvalidReputationEngine(address module);
    error InvalidArbitratorCommittee(address module);
    error ModuleNotOwned(address module, address owner);
    error InvalidPauser(address pauser);
    error PauserManagerNotDelegated(address module);
    error UnknownGovernanceTarget(address target);
    error GovernanceCallFailed(address target, bytes data);
    error MissingSelector();

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

    event GovernanceCallExecuted(
        address indexed target,
        bytes4 indexed selector,
        bytes result
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
    /// @dev Reverts with {InvalidPauser} when attempting to set the zero address.
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

    /// @notice Forward a governance-authorised call to a managed module.
    /// @param target One of the core modules owned by this contract.
    /// @param data ABI-encoded function call for the module.
    /// @return result Raw returndata from the call for off-chain inspection.
    function executeGovernanceCall(address target, bytes calldata data)
        external
        onlyGovernance
        nonReentrant
        returns (bytes memory result)
    {
        if (!_isKnownModule(target)) {
            revert UnknownGovernanceTarget(target);
        }

        if (data.length < 4) {
            revert MissingSelector();
        }

        (bool success, bytes memory response) = target.call(data);
        if (!success) {
            if (response.length > 0) {
                assembly {
                    revert(add(response, 0x20), mload(response))
                }
            }
            revert GovernanceCallFailed(target, data);
        }

        uint32 rawSelector =
            (uint32(uint8(data[0])) << 24) |
            (uint32(uint8(data[1])) << 16) |
            (uint32(uint8(data[2])) << 8) |
            uint32(uint8(data[3]));
        bytes4 selector = bytes4(rawSelector);

        emit GovernanceCallExecuted(target, selector, response);
        return response;
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
        if (pauser == address(0)) {
            revert InvalidPauser(pauser);
        }
        if (jobRegistry.pauserManager() != address(this)) {
            try jobRegistry.setPauserManager(address(this)) {} catch {}
        }
        if (jobRegistry.pauserManager() != address(this)) {
            revert PauserManagerNotDelegated(address(jobRegistry));
        }
        if (stakeManager.pauserManager() != address(this)) {
            try stakeManager.setPauserManager(address(this)) {} catch {}
        }
        if (stakeManager.pauserManager() != address(this)) {
            revert PauserManagerNotDelegated(address(stakeManager));
        }
        if (validationModule.pauserManager() != address(this)) {
            try validationModule.setPauserManager(address(this)) {} catch {}
        }
        if (validationModule.pauserManager() != address(this)) {
            revert PauserManagerNotDelegated(address(validationModule));
        }
        if (disputeModule.pauserManager() != address(this)) {
            try disputeModule.setPauserManager(address(this)) {} catch {}
        }
        if (disputeModule.pauserManager() != address(this)) {
            revert PauserManagerNotDelegated(address(disputeModule));
        }
        if (platformRegistry.pauserManager() != address(this)) {
            try platformRegistry.setPauserManager(address(this)) {} catch {}
        }
        if (platformRegistry.pauserManager() != address(this)) {
            revert PauserManagerNotDelegated(address(platformRegistry));
        }
        if (feePool.pauserManager() != address(this)) {
            try feePool.setPauserManager(address(this)) {} catch {}
        }
        if (feePool.pauserManager() != address(this)) {
            revert PauserManagerNotDelegated(address(feePool));
        }
        if (reputationEngine.pauserManager() != address(this)) {
            try reputationEngine.setPauserManager(address(this)) {} catch {}
        }
        if (reputationEngine.pauserManager() != address(this)) {
            revert PauserManagerNotDelegated(address(reputationEngine));
        }
        if (arbitratorCommittee.pauserManager() != address(this)) {
            try arbitratorCommittee.setPauserManager(address(this)) {} catch {}
        }
        if (arbitratorCommittee.pauserManager() != address(this)) {
            revert PauserManagerNotDelegated(address(arbitratorCommittee));
        }

        jobRegistry.setPauser(pauser);
        stakeManager.setPauser(pauser);
        validationModule.setPauser(pauser);
        disputeModule.setPauser(pauser);
        platformRegistry.setPauser(pauser);
        feePool.setPauser(pauser);
        reputationEngine.setPauser(pauser);
        arbitratorCommittee.setPauser(pauser);

        activePauser = pauser;

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

    function _isKnownModule(address target) internal view returns (bool) {
        return
            target == address(jobRegistry) ||
            target == address(stakeManager) ||
            target == address(validationModule) ||
            target == address(disputeModule) ||
            target == address(platformRegistry) ||
            target == address(feePool) ||
            target == address(reputationEngine) ||
            target == address(arbitratorCommittee);
    }
}

