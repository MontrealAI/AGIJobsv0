// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IJobRegistryTax} from "./interfaces/IJobRegistryTax.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";

/// @title DisputeModule
/// @notice Allows job participants to raise disputes with evidence and resolves them after a dispute window.
/// @dev Only participants bear any tax obligations; the module temporarily
/// holds dispute bonds and rejects unsolicited ETH transfers.
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
    }

    /// @dev Tracks active disputes by jobId.
    mapping(uint256 => Dispute) public disputes;
    /// @dev Bonds posted by disputing parties.
    mapping(uint256 => uint256) public bonds;

    event DisputeRaised(uint256 indexed jobId, address indexed caller, string evidence);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event ModeratorUpdated(address moderator);
    event AppealFeeUpdated(uint256 fee);
    event DisputeWindowUpdated(uint256 window);

    constructor(IJobRegistry _jobRegistry) Ownable(msg.sender) {
        jobRegistry = _jobRegistry;
        moderator = msg.sender;
    }

    modifier requiresTaxAcknowledgement() {
        IJobRegistryTax registry = IJobRegistryTax(address(jobRegistry));
        if (msg.sender != owner()) {
            require(
                registry.taxAcknowledgedVersion(msg.sender) ==
                    registry.taxPolicyVersion(),
                "acknowledge tax policy"
            );
        }
        _;
    }

    /// @notice Modifier restricting calls to the owner or moderator.
    modifier onlyArbiter() {
        require(msg.sender == owner() || msg.sender == moderator, "not authorized");
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
        requiresTaxAcknowledgement
    {
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        require(
            msg.sender == job.employer || msg.sender == job.agent,
            "not participant"
        );

        Dispute storage d = disputes[jobId];
        require(d.raisedAt == 0, "disputed");

        IStakeManager(jobRegistry.stakeManager()).lockDisputeFee(
            msg.sender,
            appealFee
        );

        disputes[jobId] = Dispute({
            claimant: msg.sender,
            evidence: evidence,
            raisedAt: block.timestamp,
            resolved: false
        });
        bonds[jobId] = appealFee;

        emit DisputeRaised(jobId, msg.sender, evidence);
    }

    /// @notice Resolve an existing dispute after the dispute window elapses.
    /// The outcome is determined by a simple pseudorandom coin flip to emulate
    /// a moderator or jury decision.
    function resolveDispute(uint256 jobId) external onlyArbiter {
        Dispute storage d = disputes[jobId];
        require(d.raisedAt != 0 && !d.resolved, "no dispute");
        require(block.timestamp >= d.raisedAt + disputeWindow, "window");

        bool employerWins = _decideOutcome(jobId);
        address payable recipient = employerWins
            ? payable(jobRegistry.jobs(jobId).employer)
            : payable(jobRegistry.jobs(jobId).agent);

        d.resolved = true;
        uint256 bond = bonds[jobId];
        delete disputes[jobId];
        delete bonds[jobId];

        jobRegistry.resolveDispute(jobId, employerWins);

        if (bond > 0) {
            IStakeManager(jobRegistry.stakeManager()).payDisputeFee(
                recipient,
                bond
            );
        }

        emit DisputeResolved(jobId, employerWins);
    }

    /// @notice Confirms the module and its owner cannot accrue tax liabilities.
    /// @return Always true, signalling perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Determine dispute outcome. Uses blockhash for a pseudorandom coin flip.
    function _decideOutcome(uint256 jobId) internal view returns (bool) {
        return uint256(blockhash(block.number - 1) ^ bytes32(jobId)) % 2 == 0;
    }
    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers that are not dispute bonds.
    receive() external payable {
        revert("DisputeModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("DisputeModule: no ether");
    }
}

