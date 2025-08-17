// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IStakeManager {
    function slash(address user, uint256 amount, address recipient) external;
}

interface IReputationEngine {
    function add(address user, uint256 amount) external;
    function subtract(address user, uint256 amount) external;
    function isBlacklisted(address user) external view returns (bool);
}

interface IValidationModule {
    function challenger(uint256 jobId) external view returns (address);
    function disputeBond() external view returns (uint256);
    function clearChallenge(uint256 jobId) external;
    function owner() external view returns (address);
}

/// @title DisputeResolution
/// @notice Resolves validation challenges, distributes bonds and updates reputation
contract DisputeResolution is Ownable {
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IValidationModule public validationModule;

    event DisputeResolved(uint256 indexed jobId, bool validatorWins);
    event StakeManagerUpdated(address manager);
    event ReputationEngineUpdated(address engine);
    event ValidationModuleUpdated(address module);

    constructor() Ownable(msg.sender) {}

    /// @notice Resolve a challenged result and distribute bonds accordingly
    /// @param jobId Identifier of the disputed job
    /// @param validatorWins True if the original validator outcome is upheld
    function resolve(uint256 jobId, bool validatorWins) external onlyOwner {
        address challengerAddr = validationModule.challenger(jobId);
        require(challengerAddr != address(0), "no challenge");
        address validator = validationModule.owner();
        uint256 bond = validationModule.disputeBond();
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(challengerAddr),
                "challenger blacklisted"
            );
            require(
                !reputationEngine.isBlacklisted(validator),
                "validator blacklisted"
            );
        }

        if (validatorWins) {
            stakeManager.slash(challengerAddr, bond, validator);
            reputationEngine.subtract(challengerAddr, 1);
            reputationEngine.add(validator, 1);
        } else {
            stakeManager.slash(validator, bond, challengerAddr);
            reputationEngine.subtract(validator, 1);
            reputationEngine.add(challengerAddr, 1);
        }

        validationModule.clearChallenge(jobId);
        emit DisputeResolved(jobId, validatorWins);
    }

    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
    }

    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    function setValidationModule(IValidationModule module) external onlyOwner {
        validationModule = module;
        emit ValidationModuleUpdated(address(module));
    }

    /// @notice Confirms the contract and owner are tax-exempt.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    receive() external payable {
        revert("DisputeResolution: no ether");
    }

    fallback() external payable {
        revert("DisputeResolution: no ether");
    }
}
