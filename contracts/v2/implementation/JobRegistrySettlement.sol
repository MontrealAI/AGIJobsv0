// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "../Governable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ITaxPolicy} from "../interfaces/ITaxPolicy.sol";
import {TaxAcknowledgement} from "../libraries/TaxAcknowledgement.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IFeePool} from "../interfaces/IFeePool.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IReputationEngine} from "../interfaces/IReputationEngine.sol";
import {IDisputeModule} from "../interfaces/IDisputeModule.sol";
import {ICertificateNFT} from "../interfaces/ICertificateNFT.sol";
import {IJobRegistryAck} from "../interfaces/IJobRegistryAck.sol";
import {IAuditModule} from "../interfaces/IAuditModule.sol";
import {TOKEN_SCALE} from "../Constants.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./JobRegistryBase.sol";
import "./FixedDelegate.sol";

/// @notice Fixed settlement implementation for JobRegistry. Deploy via the modular deployment helper.
contract JobRegistrySettlement is JobRegistryBase, DelegateOnly {
    constructor() JobRegistryBase(msg.sender) {}

    function moduleId() external pure returns (bytes32) {
        return keccak256("JobRegistrySettlement:v1");
    }

    /// @param jobId Identifier of the job being finalised.
    /// @param success True if validators approved the job.
    function finalizeAfterValidation(uint256 jobId, bool success) external onlyDelegateCall {
        return _entry_finalizeAfterValidation(jobId, success);
    }

    function validationComplete(uint256 jobId, bool success) external onlyDelegateCall {
        return _entry_validationComplete(jobId, success);
    }

    /// @notice Record a failed job outcome when validation quorum is not met.
    /// @dev This function only updates the job state; the employer or
    ///      governance must later call {finalize} to settle funds and
    ///      reputation changes.
    /// @param jobId Identifier of the job being recorded.
    function forceFinalize(uint256 jobId) external onlyDelegateCall {
        return _entry_forceFinalize(jobId);
    }

    /// @notice Agent or employer disputes a job outcome with a hash of off-chain evidence.
    /// @param jobId Identifier of the disputed job.
    /// @param evidenceHash Keccak256 hash of the evidence stored off-chain.
    /// @param reason Plain-text description or URI describing the dispute.
    function dispute(uint256 jobId, bytes32 evidenceHash, string calldata reason) public onlyDelegateCall {
        return _entry_dispute(jobId, evidenceHash, reason);
    }

    /// @notice Escalate a stalled validation into the dispute process.
    /// @dev Callable only by governance (timelock/SystemPause) as part of the incident response playbook.
    /// @param jobId Identifier of the job requiring manual intervention.
    /// @param reason Context string explaining the escalation.
    function escalateToDispute(uint256 jobId, string calldata reason) external onlyDelegateCall {
        return _entry_escalateToDispute(jobId, reason);
    }

    /// @notice Backwards-compatible wrapper for legacy integrations.
    /// @dev Calls {dispute} with the provided evidence hash.
    function raiseDispute(uint256 jobId, bytes32 evidenceHash) public onlyDelegateCall {
        return _entry_raiseDispute(jobId, evidenceHash);
    }

    /// @notice Overload supporting plain-text dispute reasons.
    /// @param jobId Identifier of the disputed job.
    /// @param reason Plain-text or URI reason for the dispute.
    function raiseDispute(uint256 jobId, string calldata reason) public onlyDelegateCall {
        return _entry_raiseDispute(jobId, reason);
    }

    /**
     * @notice Acknowledge the tax policy if needed and raise a dispute with
     *         supporting evidence stored off-chain.
     * @dev No tokens are transferred; any stake requirements elsewhere use
     *      18-decimal $AGIALPHA units that must have been approved previously.
     * @param jobId Identifier of the disputed job.
     * @param evidenceHash Keccak256 hash of the off-chain evidence.
     */
    function acknowledgeAndDispute(uint256 jobId, bytes32 evidenceHash, string calldata reason)
        public
        onlyDelegateCall
    {
        return _entry_acknowledgeAndDispute(jobId, evidenceHash, reason);
    }

    /// @notice Backwards-compatible helper without a reason string.
    function acknowledgeAndDispute(uint256 jobId, bytes32 evidenceHash) external onlyDelegateCall {
        return _entry_acknowledgeAndDispute(jobId, evidenceHash);
    }

    /// @notice Resolve a dispute relayed by the dispute module.
    /// @dev After resolution this function only records the result, moving the
    ///      job to the completed state. The employer or governance must call
    ///      {finalize} separately to settle funds and reputation.
    /// @param jobId Identifier of the disputed job
    /// @param employerWins True if the employer won the dispute
    function resolveDispute(uint256 jobId, bool employerWins) external onlyDelegateCall {
        return _entry_resolveDispute(jobId, employerWins);
    }

    /// @notice Finalize a job and trigger payouts and reputation changes.
    /// @dev The dispute module may call this without acknowledgement as it
    ///      merely relays the arbiter's ruling and holds no tax liability.
    function finalize(uint256 jobId) public onlyDelegateCall {
        return _entry_finalize(jobId);
    }

    /// @notice Acknowledge the tax policy and finalise the job in one call.
    /// @param jobId Identifier of the job to finalise
    function acknowledgeAndFinalize(uint256 jobId) external onlyDelegateCall {
        return _entry_acknowledgeAndFinalize(jobId);
    }

    /// @notice Acknowledge the tax policy and cancel a job in one call.
    /// @param jobId Identifier of the job to cancel
    function acknowledgeAndCancel(uint256 jobId) external onlyDelegateCall {
        return _entry_acknowledgeAndCancel(jobId);
    }

    /// @notice Cancel an unassigned job and refund the employer.
    /// @dev Convenience wrapper matching earlier interface expectations.
    /// Calls {cancelJob} which handles tax acknowledgement checks and
    /// refunds any locked reward back to the employer.
    /// @param jobId Identifier of the job to cancel.
    function cancel(uint256 jobId) external onlyDelegateCall {
        return _entry_cancel(jobId);
    }

    function cancelJob(uint256 jobId) public onlyDelegateCall {
        return _entry_cancelJob(jobId);
    }

    /// @notice Mark an applied job as timed out and settle funds directly.
    /// @param jobId Identifier of the job to mark as timed out.
    function claimTimeout(uint256 jobId) external onlyDelegateCall {
        return _entry_claimTimeout(jobId);
    }

    /// @notice Cancel an assigned job that failed to submit before its deadline.
    /// @dev Only the employer or governance may trigger this after the deadline.
    /// @param jobId Identifier of the job to cancel.
    function cancelExpiredJob(uint256 jobId) public onlyDelegateCall {
        return _entry_cancelExpiredJob(jobId);
    }
}
