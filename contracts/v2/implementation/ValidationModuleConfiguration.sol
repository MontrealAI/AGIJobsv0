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

/// @notice Fixed configuration implementation for ValidationModule. Deploy via the modular deployment helper.
contract ValidationModuleConfiguration is ValidationModuleBase, DelegateOnly {
    constructor() ValidationModuleBase() {}

    function moduleId() external pure returns (bytes32) {
        return keccak256("ValidationModuleConfiguration:v1");
    }

    function setPauser(address _pauser) external override onlyDelegateCall {
        return _entry_setPauser(_pauser);
    }

    function setPauserManager(address manager) external override onlyDelegateCall {
        return _entry_setPauserManager(manager);
    }

    /// @notice Update non-reveal penalty parameters.
    /// @param penaltyBps Slash applied in basis points of validator stake.
    /// @param banBlocks Number of blocks a validator is banned from new committees.
    function setNonRevealPenalty(uint256 penaltyBps, uint256 banBlocks) external override onlyDelegateCall {
        return _entry_setNonRevealPenalty(penaltyBps, banBlocks);
    }

    /// @notice Update the reveal quorum requirements.
    /// @param pct Percentage of the committee that must reveal (0-100).
    /// @param minValidators_ Absolute minimum number of reveals required.
    function setRevealQuorum(uint256 pct, uint256 minValidators_) external override onlyDelegateCall {
        return _entry_setRevealQuorum(pct, minValidators_);
    }

    /// @notice Update the cool-off delay before early finalization is permitted.
    /// @param delay Seconds to wait after quorum is met before allowing finalize.
    function setEarlyFinalizeDelay(uint256 delay) external override onlyDelegateCall {
        return _entry_setEarlyFinalizeDelay(delay);
    }

    /// @notice Update the grace period before force finalize can be triggered.
    /// @param grace Additional seconds allowed after the reveal window closes.
    function setForceFinalizeGrace(uint256 grace) external override onlyDelegateCall {
        return _entry_setForceFinalizeGrace(grace);
    }

    /// @notice Update the list of eligible validators.
    /// @param newPool Addresses of validators.
    function setValidatorPool(address[] calldata newPool) external override onlyDelegateCall {
        return _entry_setValidatorPool(newPool);
    }

    /// @notice Update the reputation engine used for validator feedback.
    function setReputationEngine(IReputationEngine engine) external override onlyDelegateCall {
        return _entry_setReputationEngine(engine);
    }

    /// @notice Update the JobRegistry reference.
    function setJobRegistry(IJobRegistry registry) external override onlyDelegateCall {
        return _entry_setJobRegistry(registry);
    }

    /// @notice Update the StakeManager reference.
    function setStakeManager(IStakeManager manager) external override onlyDelegateCall {
        return _entry_setStakeManager(manager);
    }

    /// @notice Update the identity registry used for validator verification.
    function setIdentityRegistry(IIdentityRegistry registry) external override onlyDelegateCall {
        return _entry_setIdentityRegistry(registry);
    }

    /// @notice Set the Randao coordinator used for randomness.
    /// @param coordinator Address of the RandaoCoordinator contract.
    function setRandaoCoordinator(IRandaoCoordinator coordinator) external override onlyDelegateCall {
        return _entry_setRandaoCoordinator(coordinator);
    }

    /// @notice Pause validation operations
    function pause() external override onlyDelegateCall {
        return _entry_pause();
    }

    /// @notice Resume validation operations
    function unpause() external override onlyDelegateCall {
        return _entry_unpause();
    }

    /// @notice Update the maximum number of pool entries sampled during selection.
    /// @param size Maximum number of validators examined on-chain.
    function setValidatorPoolSampleSize(uint256 size) external override onlyDelegateCall {
        return _entry_setValidatorPoolSampleSize(size);
    }

    /// @notice Update the maximum allowable size of the validator pool.
    /// @param size Maximum number of validators permitted in the pool.
    function setMaxValidatorPoolSize(uint256 size) external override onlyDelegateCall {
        return _entry_setMaxValidatorPoolSize(size);
    }

    /// @notice Update the maximum number of validators allowed per job.
    /// @param max Maximum validators permitted for any job.
    function setMaxValidatorsPerJob(uint256 max) external override onlyDelegateCall {
        return _entry_setMaxValidatorsPerJob(max);
    }

    /// @notice Configure the validator sampling strategy.
    /// @param strategy Sampling algorithm to employ when selecting validators.
    function setSelectionStrategy(IValidationModule.SelectionStrategy strategy) external override onlyDelegateCall {
        return _entry_setSelectionStrategy(strategy);
    }

    /// @notice Update the duration for cached validator authorizations.
    /// @param duration Seconds an authorization remains valid in cache.
    function setValidatorAuthCacheDuration(uint256 duration) external override onlyDelegateCall {
        return _entry_setValidatorAuthCacheDuration(duration);
    }

    /// @notice Increment the validator authorization cache version,
    /// invalidating all existing cache entries.
    function bumpValidatorAuthCacheVersion() public override onlyDelegateCall {
        return _entry_bumpValidatorAuthCacheVersion();
    }

    /// @notice Batch update core validation parameters.
    /// @param committeeSize Number of validators selected per job.
    /// @param commitDur Duration of the commit phase in seconds.
    /// @param revealDur Duration of the reveal phase in seconds.
    /// @param approvalPct Percentage of stake required for approval.
    /// @param slashPct Percentage of stake slashed for incorrect votes.
    function setParameters(
        uint256 committeeSize,
        uint256 commitDur,
        uint256 revealDur,
        uint256 approvalPct,
        uint256 slashPct
    ) external override onlyDelegateCall {
        return _entry_setParameters(committeeSize, commitDur, revealDur, approvalPct, slashPct);
    }

    /// @notice Update validator count and phase windows.
    /// @param validatorCount Number of validators per job.
    /// @param commitDur Duration of the commit phase in seconds.
    /// @param revealDur Duration of the reveal phase in seconds.
    function setParameters(uint256 validatorCount, uint256 commitDur, uint256 revealDur)
        public
        override
        onlyDelegateCall
    {
        return _entry_setParameters(validatorCount, commitDur, revealDur);
    }

    /// @notice Map validators to their ENS subdomains for selection-time checks.
    /// @param accounts Validator addresses to configure.
    /// @param subdomains ENS labels owned by each validator.
    function setValidatorSubdomains(address[] calldata accounts, string[] calldata subdomains)
        external
        override
        onlyDelegateCall
    {
        return _entry_setValidatorSubdomains(accounts, subdomains);
    }

    /// @notice Map the caller to an ENS subdomain for selection checks.
    /// @param subdomain ENS label owned by the caller.
    function setMySubdomain(string calldata subdomain) external override onlyDelegateCall {
        return _entry_setMySubdomain(subdomain);
    }

    /// @notice Update the commit and reveal windows.
    function setCommitRevealWindows(uint256 commitDur, uint256 revealDur) external override onlyDelegateCall {
        return _entry_setCommitRevealWindows(commitDur, revealDur);
    }

    /// @notice Convenience wrapper matching original API naming.
    /// @dev Alias for {setCommitRevealWindows}.
    function setTiming(uint256 commitDur, uint256 revealDur) external override onlyDelegateCall {
        return _entry_setTiming(commitDur, revealDur);
    }

    /// @notice Set minimum and maximum validators per round.
    function setValidatorBounds(uint256 minVals, uint256 maxVals) external override onlyDelegateCall {
        return _entry_setValidatorBounds(minVals, maxVals);
    }

    /// @notice Set number of validators selected per job.
    function setValidatorsPerJob(uint256 count) external override onlyDelegateCall {
        return _entry_setValidatorsPerJob(count);
    }

    /// @notice Individually update commit window duration.
    function setCommitWindow(uint256 commitDur) external override onlyDelegateCall {
        return _entry_setCommitWindow(commitDur);
    }

    /// @notice Individually update reveal window duration.
    function setRevealWindow(uint256 revealDur) external override onlyDelegateCall {
        return _entry_setRevealWindow(revealDur);
    }

    /// @notice Individually update minimum validators.
    function setMinValidators(uint256 minVals) external override onlyDelegateCall {
        return _entry_setMinValidators(minVals);
    }

    /// @notice Individually update maximum validators.
    function setMaxValidators(uint256 maxVals) external override onlyDelegateCall {
        return _entry_setMaxValidators(maxVals);
    }

    function setValidatorSlashingPct(uint256 pct) external override onlyDelegateCall {
        return _entry_setValidatorSlashingPct(pct);
    }

    /// @notice Update approval threshold percentage.
    function setApprovalThreshold(uint256 pct) external override onlyDelegateCall {
        return _entry_setApprovalThreshold(pct);
    }

    /// @notice Set the required number of validator approvals.
    function setRequiredValidatorApprovals(uint256 count) external override onlyDelegateCall {
        return _entry_setRequiredValidatorApprovals(count);
    }

    /// @notice Toggle automatic supermajority targeting for required approvals.
    /// @param enabled When true, the approval count tracks the configured threshold.
    function setAutoApprovalTarget(bool enabled) external override onlyDelegateCall {
        return _entry_setAutoApprovalTarget(enabled);
    }
}
