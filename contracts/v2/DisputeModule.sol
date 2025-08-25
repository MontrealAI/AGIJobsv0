// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";

/// @title DisputeModule
/// @notice Allows job participants to raise disputes and resolves them via
/// moderator voting. Configuration is controlled by a moderator committee
/// address which is expected to be a multisig or DAO contract.
/// @dev Dispute claimants may optionally stake an appeal fee via the
/// StakeManager which is paid out to the winner.  All amounts use 6 decimals
/// (`1 token == 1e6` units).
contract DisputeModule {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 1;

    /// @notice Registry coordinating job lifecycle state.
    IJobRegistry public immutable jobRegistry;

    /// @notice Contract managing stake and dispute fees.
    IStakeManager public immutable stakeManager;

    /// @notice Address of the committee authorised to manage moderators.
    address public committee;

    /// @notice Approved moderators eligible to vote on disputes.
    mapping(address => bool) public moderators;

    /// @notice Total number of registered moderators.
    uint256 public moderatorCount;

    /// @notice Fixed appeal fee in token units (6 decimals) required to raise a
    /// dispute. A value of 0 disables the fee.
    uint256 public appealFee;

    /// @notice Time window in seconds after which unresolved disputes may expire.
    /// @dev Defaults to 3 days and can be adjusted by the committee.
    uint64 public resolutionWindow = 3 days;

    struct Dispute {
        address claimant;
        bool resolved;
        uint64 raisedAt;
        uint64 resolveBy;
        string evidence;
    }

    /// @dev Active disputes keyed by job identifier.
    mapping(uint256 => Dispute) public disputes;

    /// @dev Track moderator votes for each dispute.
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => uint256) public employerVotes;
    mapping(uint256 => uint256) public agentVotes;

    /// @notice Emitted when a participant raises a dispute.
    event DisputeRaised(uint256 indexed jobId, address indexed claimant);

    /// @notice Emitted when a dispute is resolved.
    event DisputeResolved(uint256 indexed jobId, bool employerWins);

    /// @notice Emitted when a moderator is added or removed.
    event ModeratorAdded(address indexed moderator);
    event ModeratorRemoved(address indexed moderator);
    /// @notice Emitted when the committee address changes.
    event CommitteeUpdated(address indexed committee);

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        address _committee,
        uint256 _appealFee
    ) {
        require(address(_jobRegistry) != address(0), "registry");
        require(address(_stakeManager) != address(0), "stake mgr");
        require(_committee != address(0), "committee");
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        appealFee = _appealFee;
        committee = _committee;
        emit CommitteeUpdated(_committee);

        // bootstrap the committee as the first moderator
        moderators[_committee] = true;
        moderatorCount = 1;
        emit ModeratorAdded(_committee);
    }

    // ---------------------------------------------------------------------
    // Moderator configuration
    // ---------------------------------------------------------------------

    /// @notice Register a new moderator.
    function addModerator(address moderator) external onlyCommittee {
        require(moderator != address(0), "moderator");
        require(!moderators[moderator], "exists");
        moderators[moderator] = true;
        moderatorCount += 1;
        emit ModeratorAdded(moderator);
    }

    /// @notice Remove an existing moderator.
    function removeModerator(address moderator) external onlyCommittee {
        require(moderators[moderator], "not moderator");
        moderators[moderator] = false;
        moderatorCount -= 1;
        emit ModeratorRemoved(moderator);
    }

    /// @notice Update the committee multisig address.
    function setCommittee(address _committee) external onlyCommittee {
        require(_committee != address(0), "committee");
        committee = _committee;
        emit CommitteeUpdated(_committee);
    }

    /// @notice Configure the dispute resolution window in seconds.
    /// @param window Duration after which an unresolved dispute can expire.
    function setResolutionWindow(uint64 window) external onlyCommittee {
        resolutionWindow = window;
    }

    /// @dev Restrict calls to the JobRegistry
    modifier onlyJobRegistry() {
        require(msg.sender == address(jobRegistry), "not registry");
        _;
    }

    /// @dev Restrict calls to the committee multisig.
    modifier onlyCommittee() {
        require(msg.sender == committee, "not committee");
        _;
    }

    /// @notice Raise a dispute for a given job.
    /// @param jobId Identifier of the disputed job.
    /// @param claimant Address of the disputing participant forwarded by JobRegistry.
    /// @param evidence Supporting evidence for the dispute.
    function raiseDispute(
        uint256 jobId,
        address claimant,
        string calldata evidence
    ) external onlyJobRegistry {
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        require(
            claimant == job.employer || claimant == job.agent,
            "not participant"
        );
        Dispute storage d = disputes[jobId];
        require(d.claimant == address(0), "disputed");

        if (appealFee > 0) {
            stakeManager.lockDisputeFee(claimant, appealFee);
        }

        disputes[jobId] = Dispute({
            claimant: claimant,
            resolved: false,
            raisedAt: uint64(block.timestamp),
            resolveBy: uint64(block.timestamp + resolutionWindow),
            evidence: evidence
        });
        emit DisputeRaised(jobId, claimant);
    }

    /// @notice Resolve a previously raised dispute. Moderators cast votes and
    /// once a majority is reached the dispute finalises.
    function resolve(uint256 jobId, bool employerWins) external {
        Dispute storage d = disputes[jobId];
        require(d.claimant != address(0) && !d.resolved, "no dispute");
        require(moderators[msg.sender], "not moderator");
        require(block.timestamp <= d.resolveBy, "expired");
        require(!hasVoted[jobId][msg.sender], "voted");
        hasVoted[jobId][msg.sender] = true;

        if (employerWins) {
            employerVotes[jobId] += 1;
            if (employerVotes[jobId] >= _threshold()) {
                _finalize(jobId, true);
            }
        } else {
            agentVotes[jobId] += 1;
            if (agentVotes[jobId] >= _threshold()) {
                _finalize(jobId, false);
            }
        }
    }

    /// @notice Expire a dispute that has passed its resolution window.
    /// @param jobId Identifier of the dispute to expire.
    function expireDispute(uint256 jobId) external {
        Dispute storage d = disputes[jobId];
        require(d.claimant != address(0) && !d.resolved, "no dispute");
        require(block.timestamp > d.resolveBy, "active");
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        bool employerWins = d.claimant == job.agent;
        _finalize(jobId, employerWins);
    }

    /// @dev Internal helper returning the number of votes required for
    /// resolution.
    function _threshold() internal view returns (uint256) {
        return moderatorCount / 2 + 1; // majority
    }

    /// @dev Finalises a dispute and distributes fees.
    function _finalize(uint256 jobId, bool employerWins) internal {
        Dispute storage d = disputes[jobId];
        d.resolved = true;

        jobRegistry.resolveDispute(jobId, employerWins);

        if (appealFee > 0) {
            address winner = employerWins
                ? jobRegistry.jobs(jobId).employer
                : jobRegistry.jobs(jobId).agent;
            stakeManager.payDisputeFee(winner, appealFee);
        }

        delete disputes[jobId];
        delete employerVotes[jobId];
        delete agentVotes[jobId];
        // hasVoted mapping entries are left as-is since jobIds are unique.
        emit DisputeResolved(jobId, employerWins);
    }
}

