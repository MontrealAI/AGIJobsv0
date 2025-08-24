// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";

/// @title DisputeModule
/// @notice Allows job participants to raise disputes and enables a moderator
/// to resolve them by finalising outcomes in the JobRegistry.
/// @dev Dispute claimants may optionally stake an appeal fee via the
/// StakeManager which is paid out to the winner.
contract DisputeModule is Ownable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 1;

    /// @notice Registry coordinating job lifecycle state.
    IJobRegistry public immutable jobRegistry;

    /// @notice Contract managing stake and dispute fees.
    IStakeManager public immutable stakeManager;

    /// @notice Address authorised to resolve disputes.
    address public moderator;

    /// @notice Fixed appeal fee in token units (6 decimals) required to raise a
    /// dispute. A value of 0 disables the fee.
    uint256 public appealFee;

    struct Dispute {
        address claimant;
        bool resolved;
    }

    /// @dev Active disputes keyed by job identifier.
    mapping(uint256 => Dispute) public disputes;

    /// @notice Emitted when a participant raises a dispute.
    event DisputeRaised(uint256 indexed jobId, address indexed claimant);

    /// @notice Emitted when the moderator resolves a dispute.
    event DisputeResolved(uint256 indexed jobId, bool employerWins);

    /// @notice Emitted when the moderator address is updated.
    /// @param moderator Address of the new moderator
    event ModeratorUpdated(address indexed moderator);

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        address _moderator,
        uint256 _appealFee
    ) Ownable(msg.sender) {
        require(address(_jobRegistry) != address(0), "registry");
        require(address(_stakeManager) != address(0), "stake mgr");
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        moderator = _moderator;
        appealFee = _appealFee;
    }

    /// @notice Update the moderator address.
    /// @param _moderator New moderator able to resolve disputes.
    function setModerator(address _moderator) external onlyOwner {
        require(_moderator != address(0), "moderator");
        moderator = _moderator;
        emit ModeratorUpdated(_moderator);
    }

    /// @dev Restrict calls to the designated moderator.
    modifier onlyModerator() {
        require(msg.sender == moderator, "not moderator");
        _;
    }

    /// @notice Raise a dispute for a given job.
    /// @param jobId Identifier of the disputed job.
    function raiseDispute(uint256 jobId) external {
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        require(
            msg.sender == job.employer || msg.sender == job.agent,
            "not participant"
        );
        Dispute storage d = disputes[jobId];
        require(d.claimant == address(0), "disputed");

        if (appealFee > 0) {
            stakeManager.lockDisputeFee(msg.sender, appealFee);
        }

        disputes[jobId] = Dispute({claimant: msg.sender, resolved: false});
        emit DisputeRaised(jobId, msg.sender);
    }

    /// @notice Resolve a previously raised dispute.
    /// @param jobId Identifier of the disputed job.
    /// @param employerWins True if the employer prevails.
    function resolve(uint256 jobId, bool employerWins)
        external
        onlyModerator
    {
        Dispute storage d = disputes[jobId];
        require(d.claimant != address(0) && !d.resolved, "no dispute");
        d.resolved = true;

        // Forward outcome to JobRegistry for fund distribution.
        jobRegistry.resolveDispute(jobId, employerWins);

        if (appealFee > 0) {
            address winner = employerWins
                ? jobRegistry.jobs(jobId).employer
                : jobRegistry.jobs(jobId).agent;
            stakeManager.payDisputeFee(winner, appealFee);
        }

        delete disputes[jobId];
        emit DisputeResolved(jobId, employerWins);
    }
}

