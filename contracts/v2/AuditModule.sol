// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IAuditModule} from "./interfaces/IAuditModule.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";

/// @title AuditModule
/// @notice Randomly schedules post-completion audits and applies penalties for failed reviews.
/// @dev The module keeps the owner tax neutral and stores only lightweight metadata
///      (agent, hashes, timestamps) needed to reconstruct an audit trail off-chain.
contract AuditModule is IAuditModule, Ownable, Pausable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 1;

    /// @notice Basis points used to express audit probability percentages.
    uint256 public constant MAX_BPS = 10_000;

    /// @notice Address of the canonical JobRegistry allowed to notify completions.
    address public jobRegistry;

    /// @notice Reputation engine used for penalties.
    IReputationEngine public reputationEngine;

    /// @notice Probability (in basis points) that a completed job is audited.
    uint256 public auditProbabilityBps;

    /// @notice Reputation penalty applied when an audit fails.
    uint256 public auditPenalty;

    /// @notice Authorised auditors allowed to record audit outcomes.
    mapping(address => bool) public auditors;

    /// @notice Metadata captured when an audit is scheduled.
    struct AuditRecord {
        address agent;
        bytes32 resultHash;
        bytes32 seed;
        uint64 scheduledAt;
        bool completed;
        bool passed;
    }

    mapping(uint256 => AuditRecord) public audits;

    error OnlyJobRegistry();
    error UnauthorizedAuditor();
    error AuditNotScheduled();
    error AuditAlreadyCompleted();
    error InvalidProbability();

    event JobRegistryUpdated(address registry);
    event ReputationEngineUpdated(address reputationEngine);
    event AuditProbabilityUpdated(uint256 probabilityBps);
    event AuditPenaltyUpdated(uint256 penalty);
    event AuditorUpdated(address indexed auditor, bool allowed);

    constructor(address _jobRegistry, IReputationEngine _reputation) Ownable(msg.sender) {
        jobRegistry = _jobRegistry;
        reputationEngine = _reputation;
    }

    /// @notice Configure the JobRegistry permitted to trigger audits.
    function setJobRegistry(address registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(registry);
    }

    /// @notice Configure the reputation engine used for penalties.
    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    /// @notice Update the probability that a job is selected for audit.
    /// @param probabilityBps Probability expressed in basis points (0-10_000).
    function setAuditProbabilityBps(uint256 probabilityBps) external onlyOwner {
        if (probabilityBps > MAX_BPS) revert InvalidProbability();
        auditProbabilityBps = probabilityBps;
        emit AuditProbabilityUpdated(probabilityBps);
    }

    /// @notice Update the reputation penalty applied when an audit fails.
    function setAuditPenalty(uint256 penalty) external onlyOwner {
        auditPenalty = penalty;
        emit AuditPenaltyUpdated(penalty);
    }

    /// @notice Grant or revoke auditor permissions.
    function setAuditor(address auditor, bool allowed) external onlyOwner {
        auditors[auditor] = allowed;
        emit AuditorUpdated(auditor, allowed);
    }

    /// @inheritdoc IAuditModule
    function onJobFinalized(
        uint256 jobId,
        address agent,
        bool success,
        bytes32 resultHash
    ) external override whenNotPaused {
        if (msg.sender != jobRegistry) revert OnlyJobRegistry();
        if (!success || agent == address(0) || auditProbabilityBps == 0) {
            return;
        }

        bytes32 bhash = block.number > 0 ? blockhash(block.number - 1) : bytes32(0);
        bytes32 seed = keccak256(
            abi.encodePacked(jobId, agent, resultHash, bhash, block.prevrandao, block.timestamp)
        );

        if (uint256(seed) % MAX_BPS >= auditProbabilityBps) {
            return;
        }

        audits[jobId] = AuditRecord({
            agent: agent,
            resultHash: resultHash,
            seed: seed,
            scheduledAt: uint64(block.timestamp),
            completed: false,
            passed: false
        });

        emit AuditScheduled(jobId, agent, resultHash, seed);
    }

    /// @notice Record the result of an audit for a job.
    /// @param jobId Identifier of the audited job.
    /// @param passed True if the audit confirmed the job outcome.
    /// @param details Free-form context stored on-chain for transparency.
    function recordAudit(
        uint256 jobId,
        bool passed,
        string calldata details
    ) external whenNotPaused {
        if (!auditors[msg.sender]) revert UnauthorizedAuditor();
        AuditRecord storage record = audits[jobId];
        if (record.agent == address(0)) revert AuditNotScheduled();
        if (record.completed) revert AuditAlreadyCompleted();

        record.completed = true;
        record.passed = passed;

        emit AuditRecorded(jobId, msg.sender, passed, details);

        if (!passed && address(reputationEngine) != address(0) && auditPenalty > 0) {
            reputationEngine.subtract(record.agent, auditPenalty);
            emit AuditPenaltyApplied(jobId, record.agent, auditPenalty);
        }
    }

    /// @notice Halt audit scheduling and processing during incidents.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume audit scheduling and processing after incidents are resolved.
    function unpause() external onlyOwner {
        _unpause();
    }
}
