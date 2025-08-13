// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";

/// @title DisputeModule
/// @notice Allows job participants to raise disputes with evidence and resolves them after a dispute window.
/// @dev Only participants bear any tax obligations; the module escrows token
/// based dispute fees via the StakeManager and rejects unsolicited ETH
/// transfers.
contract DisputeModule is Ownable {
    IJobRegistry public jobRegistry;

    /// @notice Fee required to initiate a dispute, in token units (6 decimals).
    uint256 public appealFee;

    /// @notice Time that must elapse before a dispute can be resolved.
    uint256 public disputeWindow;

    /// @notice Optional moderator address that can resolve disputes.
    address public moderator;

    struct Dispute {
        address claimant;
        string evidence;
        uint256 raisedAt;
        bool resolved;
        uint256 fee;
    }

    /// @dev Tracks active disputes by jobId.
    mapping(uint256 => Dispute) public disputes;

    event DisputeRaised(uint256 indexed jobId, address indexed caller, string evidence);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event ModeratorUpdated(address moderator);
    event AppealFeeUpdated(uint256 fee);
    event DisputeWindowUpdated(uint256 window);

    constructor(IJobRegistry _jobRegistry) Ownable(msg.sender) {
        jobRegistry = _jobRegistry;
        moderator = msg.sender;
    }

    /// @notice Modifier restricting calls to the owner or moderator.
    modifier onlyArbiter() {
        require(msg.sender == owner() || msg.sender == moderator, "not authorized");
        _;
    }

    /// @notice Restrict functions to the JobRegistry.
    modifier onlyJobRegistry() {
        require(msg.sender == address(jobRegistry), "not registry");
        _;
    }

    /// @notice Set the moderator address.
    function setModerator(address _moderator) external onlyOwner {
        moderator = _moderator;
        emit ModeratorUpdated(_moderator);
    }

    /// @notice Configure the appeal fee in token units (6 decimals).
    function setAppealFee(uint256 fee) external onlyOwner {
        appealFee = fee;
        emit AppealFeeUpdated(fee);
    }

    /// @notice Configure the dispute resolution window.
    function setDisputeWindow(uint256 window) external onlyOwner {
        disputeWindow = window;
        emit DisputeWindowUpdated(window);
    }

    /// @notice Raise a dispute by posting the appeal fee and providing evidence.
    /// @param jobId Identifier of the job being disputed.
    /// @param evidence Supporting evidence for the dispute.
    function raiseDispute(uint256 jobId, string calldata evidence)
        external
        onlyJobRegistry
    {
        Dispute storage d = disputes[jobId];
        require(d.raisedAt == 0, "disputed");

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        address claimant = job.agent;

        // Lock the dispute fee in the StakeManager if configured.
        if (appealFee > 0) {
            try
                IStakeManager(jobRegistry.stakeManager()).lockDisputeFee(
                    claimant,
                    appealFee
                )
            {} catch {}
        }

        disputes[jobId] = Dispute({
            claimant: claimant,
            evidence: evidence,
            raisedAt: block.timestamp,
            resolved: false,
            fee: appealFee
        });

        emit DisputeRaised(jobId, claimant, evidence);
    }

    /// @notice Resolve an existing dispute after the dispute window elapses.
    /// @param jobId Identifier of the disputed job.
    /// @param employerWins True if the employer prevails.
    function resolveDispute(uint256 jobId, bool employerWins)
        external
        onlyArbiter
    {
        Dispute storage d = disputes[jobId];
        require(d.raisedAt != 0 && !d.resolved, "no dispute");
        require(block.timestamp >= d.raisedAt + disputeWindow, "window");

        d.resolved = true;

        address recipient = employerWins
            ? jobRegistry.jobs(jobId).employer
            : d.claimant;
        uint256 fee = d.fee;
        delete disputes[jobId];

        jobRegistry.resolveDispute(jobId, employerWins);

        if (fee > 0) {
            IStakeManager(jobRegistry.stakeManager()).payDisputeFee(
                recipient,
                fee
            );
        }

        emit DisputeResolved(jobId, employerWins);
    }

    /// @notice Confirms the module and its owner cannot accrue tax liabilities.
    /// @return Always true, signalling perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }
    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers; all fees are handled in tokens.
    receive() external payable {
        revert("DisputeModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("DisputeModule: no ether");
    }
}

