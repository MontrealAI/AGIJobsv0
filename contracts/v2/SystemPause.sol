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

/// @title SystemPause
/// @notice Helper contract allowing governance to pause or unpause all core modules.
contract SystemPause is Governable {
    JobRegistry public jobRegistry;
    StakeManager public stakeManager;
    ValidationModule public validationModule;
    DisputeModule public disputeModule;
    PlatformRegistry public platformRegistry;
    FeePool public feePool;
    ReputationEngine public reputationEngine;

    event ModulesUpdated(
        address jobRegistry,
        address stakeManager,
        address validationModule,
        address disputeModule,
        address platformRegistry,
        address feePool,
        address reputationEngine
    );

    constructor(
        JobRegistry _jobRegistry,
        StakeManager _stakeManager,
        ValidationModule _validationModule,
        DisputeModule _disputeModule,
        PlatformRegistry _platformRegistry,
        FeePool _feePool,
        ReputationEngine _reputationEngine,
        address _governance
    ) Governable(_governance) {
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        validationModule = _validationModule;
        disputeModule = _disputeModule;
        platformRegistry = _platformRegistry;
        feePool = _feePool;
        reputationEngine = _reputationEngine;
    }

    function setModules(
        JobRegistry _jobRegistry,
        StakeManager _stakeManager,
        ValidationModule _validationModule,
        DisputeModule _disputeModule,
        PlatformRegistry _platformRegistry,
        FeePool _feePool,
        ReputationEngine _reputationEngine
    ) external onlyGovernance {
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        validationModule = _validationModule;
        disputeModule = _disputeModule;
        platformRegistry = _platformRegistry;
        feePool = _feePool;
        reputationEngine = _reputationEngine;
        emit ModulesUpdated(
            address(_jobRegistry),
            address(_stakeManager),
            address(_validationModule),
            address(_disputeModule),
            address(_platformRegistry),
            address(_feePool),
            address(_reputationEngine)
        );
    }

    /// @notice Pause all core modules.
    function pauseAll() external onlyGovernance {
        jobRegistry.pause();
        stakeManager.pause();
        validationModule.pause();
        disputeModule.pause();
        platformRegistry.pause();
        feePool.pause();
        reputationEngine.pause();
    }

    /// @notice Unpause all core modules.
    function unpauseAll() external onlyGovernance {
        jobRegistry.unpause();
        stakeManager.unpause();
        validationModule.unpause();
        disputeModule.unpause();
        platformRegistry.unpause();
        feePool.unpause();
        reputationEngine.unpause();
    }
}

