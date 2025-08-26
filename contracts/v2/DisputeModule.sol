// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {Governable} from "./Governable.sol";

/// @title DisputeModule
/// @notice Allows job participants to raise disputes and resolves them via
/// moderator voting. Configuration is controlled by a governance address
/// which is expected to be a Timelock or multisig contract.
/// @dev Dispute claimants may optionally stake an appeal fee via the
/// StakeManager which is paid out to the winner.  All amounts use 6 decimals
/// (`1 token == 1e6` units).
contract DisputeModule is Governable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 1;

    /// @notice Registry coordinating job lifecycle state.
    IJobRegistry public immutable jobRegistry;

    /// @notice Contract managing stake and dispute fees.
    IStakeManager public immutable stakeManager;

    /// @notice Approved moderators eligible to vote on disputes.
    mapping(address => bool) public moderators;

    /// @notice Enumerates moderator addresses for off-chain inspection.
    address[] public moderatorList;

    /// @notice Total number of registered moderators.
    uint256 public moderatorCount;

    /// @notice Votes required to resolve a dispute.
    /// @dev Defaults to simple majority and updates with moderator changes.
    uint256 public quorum;

    /// @notice Fixed appeal fee in token units (6 decimals) required to raise a
    /// dispute. A value of 0 disables the fee.
    uint256 public appealFee;

    /// @notice Time window in seconds after which unresolved disputes may expire.
    /// @dev Defaults to 3 days and can be adjusted by governance.
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
    /// @notice Emitted when quorum is updated.
    event QuorumUpdated(uint256 quorum);
    /// @notice Emitted when a moderator casts a vote.
    event VoteCast(
        uint256 indexed jobId,
        address indexed moderator,
        bool employerWins,
        uint256 employerVotes,
        uint256 agentVotes
    );
    /// @notice Emitted when a dispute finalises with vote totals.
    event VoteTally(
        uint256 indexed jobId,
        uint256 employerVotes,
        uint256 agentVotes
    );

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        address _governance,
        uint256 _appealFee
    ) Governable(_governance) {
        require(address(_jobRegistry) != address(0), "registry");
        require(address(_stakeManager) != address(0), "stake mgr");
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        appealFee = _appealFee;
        emit GovernanceUpdated(_governance);

        // bootstrap governance as the first moderator
        moderators[_governance] = true;
        moderatorList.push(_governance);
        moderatorCount = 1;
        quorum = _calcQuorum(1);
        emit ModeratorAdded(_governance);
        emit QuorumUpdated(quorum);
    }

    // ---------------------------------------------------------------------
    // Moderator configuration
    // ---------------------------------------------------------------------

    /// @notice Register a new moderator.
    function addModerator(address moderator) external onlyGovernance {
        require(moderator != address(0), "moderator");
        require(!moderators[moderator], "exists");
        moderators[moderator] = true;
        moderatorList.push(moderator);
        moderatorCount += 1;
        quorum = _calcQuorum(moderatorCount);
        emit ModeratorAdded(moderator);
        emit QuorumUpdated(quorum);
    }

    /// @notice Remove an existing moderator.
    function removeModerator(address moderator) external onlyGovernance {
        require(moderators[moderator], "not moderator");
        moderators[moderator] = false;
        for (uint256 i; i < moderatorList.length; ++i) {
            if (moderatorList[i] == moderator) {
                moderatorList[i] = moderatorList[moderatorList.length - 1];
                moderatorList.pop();
                break;
            }
        }
        moderatorCount -= 1;
        quorum = _calcQuorum(moderatorCount);
        emit ModeratorRemoved(moderator);
        emit QuorumUpdated(quorum);
    }

    /// @notice Configure the dispute resolution window in seconds.
    /// @param window Duration after which an unresolved dispute can expire.
    function setResolutionWindow(uint64 window) external onlyGovernance {
        resolutionWindow = window;
    }

    /// @notice Update the quorum required to finalise disputes.
    /// @param newQuorum Number of moderator votes needed for resolution.
    function setQuorum(uint256 newQuorum) external onlyGovernance {
        require(newQuorum > 0 && newQuorum <= moderatorCount, "quorum");
        quorum = newQuorum;
        emit QuorumUpdated(newQuorum);
    }

    /// @notice Return the current list of moderator addresses.
    function getModerators() external view returns (address[] memory) {
        return moderatorList;
    }

    /// @dev Restrict calls to the JobRegistry
    modifier onlyJobRegistry() {
        require(msg.sender == address(jobRegistry), "not registry");
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
        } else {
            agentVotes[jobId] += 1;
        }

        emit VoteCast(
            jobId,
            msg.sender,
            employerWins,
            employerVotes[jobId],
            agentVotes[jobId]
        );

        if (employerVotes[jobId] >= quorum) {
            _finalize(jobId, true);
        } else if (agentVotes[jobId] >= quorum) {
            _finalize(jobId, false);
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

    /// @dev Compute majority quorum for a given moderator count.
    function _calcQuorum(uint256 count) internal pure returns (uint256) {
        return count / 2 + 1; // simple majority
    }

    /// @dev Finalises a dispute and distributes fees.
    function _finalize(uint256 jobId, bool employerWins) internal {
        uint256 empVotes = employerVotes[jobId];
        uint256 agVotes = agentVotes[jobId];

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
        emit VoteTally(jobId, empVotes, agVotes);
        emit DisputeResolved(jobId, employerWins);
    }
}

