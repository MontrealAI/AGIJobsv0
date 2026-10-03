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

/// @notice Fixed voting implementation for ValidationModule. Deploy via the modular deployment helper.
contract ValidationModuleVoting is ValidationModuleBase, DelegateOnly {
    constructor() ValidationModuleBase() {}

    function moduleId() external pure returns (bytes32) {
        return keccak256("ValidationModuleVoting:v1");
    }

    /// @notice Trigger a circuit-breaker style failover for an in-flight validation round.
    /// @param jobId Identifier of the job whose validation flow is being adjusted.
    /// @param action Failover action to execute (reveal extension or dispute escalation).
    /// @param extension Additional seconds to append to the reveal window when extending.
    /// @param reason Human-readable context for observability purposes.
    function triggerFailover(
        uint256 jobId,
        IValidationModule.FailoverAction action,
        uint64 extension,
        string calldata reason
    ) external override onlyDelegateCall {
        return _entry_triggerFailover(jobId, action, extension, reason);
    }

    /// @notice Commit a validation hash for a job.
    function commitValidation(uint256 jobId, bytes32 commitHash, string calldata subdomain, bytes32[] calldata proof)
        public
        override
        onlyDelegateCall
    {
        return _entry_commitValidation(jobId, commitHash, subdomain, proof);
    }

    /// @notice Reveal a previously committed validation vote.
    function revealValidation(
        uint256 jobId,
        bool approve,
        bytes32 burnTxHash,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public override onlyDelegateCall {
        return _entry_revealValidation(jobId, approve, burnTxHash, salt, subdomain, proof);
    }

    /// @notice Backwards-compatible wrapper for commitValidation.
    function commitVote(uint256 jobId, bytes32 commitHash, string calldata subdomain, bytes32[] calldata proof)
        external
        override
        onlyDelegateCall
    {
        return _entry_commitVote(jobId, commitHash, subdomain, proof);
    }

    /// @notice Backwards-compatible wrapper for revealValidation.
    function revealVote(
        uint256 jobId,
        bool approve,
        bytes32 burnTxHash,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external override onlyDelegateCall {
        return _entry_revealVote(jobId, approve, burnTxHash, salt, subdomain, proof);
    }

    /// @notice Tally revealed votes, apply slashing/rewards, and push result to JobRegistry.
    function finalize(uint256 jobId) external override onlyDelegateCall returns (bool success) {
        return _entry_finalize(jobId);
    }

    function finalizeValidation(uint256 jobId) external override onlyDelegateCall returns (bool success) {
        return _entry_finalizeValidation(jobId);
    }

    /// @notice Force finalize a job after the reveal deadline plus grace period.
    /// @dev If quorum was not met, no result is recorded and the employer/agent are refunded.
    /// @param jobId Identifier of the job
    /// @return success True if validators approved the job
    function forceFinalize(uint256 jobId) external override onlyDelegateCall returns (bool success) {
        return _entry_forceFinalize(jobId);
    }
}
