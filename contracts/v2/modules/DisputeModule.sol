// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";

/// @title DisputeModule
/// @notice Allows job participants to raise disputes with evidence and resolves
/// them after a dispute window.
/// @dev Maintains tax neutrality by rejecting ether and escrowing only token
///      based dispute fees via the StakeManager. Assumes all token amounts use
///      6 decimals (`1 token == 1e6` units).
contract DisputeModule is Ownable {
    IJobRegistry public jobRegistry;

    /// @notice Fee required to initiate a dispute, in token units (6 decimals).
    /// @dev Defaults to 1 token (1e6 units) if zero is provided to the constructor.
    uint256 public disputeFee;

    /// @notice Time that must elapse before a dispute can be resolved.
    /// @dev Defaults to 1 day if zero is provided to the constructor.
    uint256 public disputeWindow;

    /// @notice Owner‑appointed addresses allowed to resolve disputes.
    mapping(address => bool) public moderators;

    struct Dispute {
        address claimant;
        string evidence;
        uint256 raisedAt;
        bool resolved;
        uint256 fee;
    }

    /// @dev Tracks active disputes by jobId.
    mapping(uint256 => Dispute) public disputes;

    event DisputeRaised(
        uint256 indexed jobId,
        address indexed claimant,
        string evidence
    );
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event ModeratorUpdated(address moderator, bool enabled);
    event DisputeFeeUpdated(uint256 fee);
    event DisputeWindowUpdated(uint256 window);
    event JobRegistryUpdated(IJobRegistry newRegistry);
    event ModulesUpdated(address indexed jobRegistry);

    /// @param _jobRegistry Address of the JobRegistry contract.
    /// @param _disputeFee Initial dispute fee in token units (6 decimals); defaults to 1e6.
    /// @param _disputeWindow Minimum time in seconds before resolution; defaults to 1 day.
    /// @param _moderator Optional moderator address; defaults to the deployer.
    constructor(
        IJobRegistry _jobRegistry,
        uint256 _disputeFee,
        uint256 _disputeWindow,
        address _moderator
    ) Ownable(msg.sender) {
        if (address(_jobRegistry) != address(0)) {
            jobRegistry = _jobRegistry;
            emit JobRegistryUpdated(_jobRegistry);
            emit ModulesUpdated(address(_jobRegistry));
        }

        disputeFee = _disputeFee > 0 ? _disputeFee : 1e6;
        emit DisputeFeeUpdated(disputeFee);

        disputeWindow = _disputeWindow > 0 ? _disputeWindow : 1 days;
        emit DisputeWindowUpdated(disputeWindow);

        address initialModerator =
            _moderator != address(0) ? _moderator : msg.sender;
        moderators[initialModerator] = true;
        emit ModeratorUpdated(initialModerator, true);
    }

    /// @notice Modifier restricting calls to the owner or moderator.
    modifier onlyArbiter() {
        require(
            msg.sender == owner() || moderators[msg.sender],
            "not authorized"
        );
        _;
    }

    /// @notice Restrict functions to the JobRegistry.
    modifier onlyJobRegistry() {
        require(msg.sender == address(jobRegistry), "not registry");
        _;
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Update the JobRegistry reference.
    /// @param newRegistry New JobRegistry contract implementing IJobRegistry.
    function setJobRegistry(IJobRegistry newRegistry) external onlyOwner {
        jobRegistry = newRegistry;
        emit JobRegistryUpdated(newRegistry);
        emit ModulesUpdated(address(newRegistry));
    }

    /// @notice Add or remove a moderator address.
    /// @param _moderator Address of the moderator.
    /// @param enabled True to grant, false to revoke.
    function setModerator(address _moderator, bool enabled)
        external
        onlyOwner
    {
        moderators[_moderator] = enabled;
        emit ModeratorUpdated(_moderator, enabled);
    }

    /// @notice Configure the dispute fee in token units (6 decimals).
    /// @param fee New dispute fee; 0 disables the fee.
    function setDisputeFee(uint256 fee) external onlyOwner {
        disputeFee = fee;
        emit DisputeFeeUpdated(fee);
    }

    /// @notice Configure the dispute resolution window in seconds.
    /// @param window Minimum time before a dispute can be resolved.
    function setDisputeWindow(uint256 window) external onlyOwner {
        disputeWindow = window;
        emit DisputeWindowUpdated(window);
    }

    /// @notice Raise a dispute by posting the dispute fee and providing evidence.
    /// @param jobId Identifier of the job being disputed.
    /// @param claimant Address of the party raising the dispute.
    /// @param evidence Supporting evidence for the dispute.
    function raiseDispute(
        uint256 jobId,
        address claimant,
        string calldata evidence
    ) external onlyJobRegistry {
        Dispute storage d = disputes[jobId];
        require(d.raisedAt == 0, "disputed");

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        require(
            claimant == job.agent || claimant == job.employer,
            "not participant"
        );

        // Lock the dispute fee in the StakeManager if configured.
        if (disputeFee > 0) {
            IStakeManager(jobRegistry.stakeManager()).lockDisputeFee(
                claimant,
                disputeFee
            );
        }

        disputes[jobId] = Dispute({
            claimant: claimant,
            evidence: evidence,
            raisedAt: block.timestamp,
            resolved: false,
            fee: disputeFee
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

