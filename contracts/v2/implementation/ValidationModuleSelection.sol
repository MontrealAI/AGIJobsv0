// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {IJobRegistryTax} from "../interfaces/IJobRegistryTax.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IReputationEngine} from "../interfaces/IReputationEngine.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {ITaxPolicy} from "../interfaces/ITaxPolicy.sol";
import {IRandaoCoordinator} from "../interfaces/IRandaoCoordinator.sol";
import {TaxAcknowledgement} from "../libraries/TaxAcknowledgement.sol";

import "./ValidationModuleBase.sol";
import "./FixedDelegate.sol";

/// @notice Fixed selection implementation for ValidationModule. Deploy via the modular deployment helper.
contract ValidationModuleSelection is ValidationModuleBase, DelegateOnly {
    constructor() ValidationModuleBase() {}

    function moduleId() external pure returns (bytes32) {
        return keccak256("ValidationModuleSelection:v1");
    }

    /// @inheritdoc IValidationModule
    /// @dev Randomness draws from aggregated caller-provided entropy and on-chain data.
    ///      Callers may submit additional entropy prior to finalization; each
    ///      contribution is XORed into an entropy pool. The pool is then mixed with
    ///      a future blockhash and `block.prevrandao` (or historical hashes and
    ///      `msg.sender` as fallback) to avoid external randomness providers and
    ///      minimize miner influence.
    function selectValidators(uint256 jobId, uint256 entropy)
        public
        override
        onlyDelegateCall
        returns (address[] memory selected)
    {
        return _entry_selectValidators(jobId, entropy);
    }

    /// @inheritdoc IValidationModule
    function start(uint256 jobId, uint256 entropy) external override onlyDelegateCall returns (address[] memory) {
        return _entry_start(jobId, entropy);
    }

    /// @notice Reset the validation nonce for a job after finalization or dispute resolution.
    /// @param jobId Identifier of the job
    function resetJobNonce(uint256 jobId) external override onlyDelegateCall {
        return _entry_resetJobNonce(jobId);
    }

    /// @notice Reset pending entropy and selection block for a job to allow reselection.
    /// @param jobId Identifier of the job.
    function resetSelection(uint256 jobId) external override onlyDelegateCall {
        return _entry_resetSelection(jobId);
    }
}
