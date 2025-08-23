// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IJobRegistry {
    enum Status { None, Created, Completed, Disputed, Finalized }
    struct Job {
        address employer;
        address agent;
        uint256 reward;
        uint256 stake;
        uint256 fee;
        bool success;
        Status status;
        string outputURI;
        uint256 deadline;
    }
    function jobs(uint256 jobId) external view returns (Job memory);
    function resolveDispute(uint256 jobId, bool employerWins) external;
}

interface IStakeManager {
    function lockReward(address from, uint256 amount) external;
    function payReward(address to, uint256 amount) external;
}

/// @title DisputeModule
/// @notice Handles job outcome disputes and distributes dispute fees based on the verdict.
contract DisputeModule is Ownable {
    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;

    uint256 public disputeFee;
    uint256 public disputeWindow;
    address public moderator;

    struct Dispute {
        address claimant;
        uint256 raisedAt;
        uint256 fee;
    }

    mapping(uint256 => Dispute) public disputes;

    event DisputeRaised(uint256 indexed jobId, address indexed claimant);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event ModeratorUpdated(address moderator);
    event DisputeFeeUpdated(uint256 fee);
    event DisputeWindowUpdated(uint256 window);

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        uint256 _disputeFee,
        uint256 _disputeWindow,
        address _moderator
    ) Ownable(msg.sender) {
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        disputeFee = _disputeFee;
        disputeWindow = _disputeWindow;
        moderator = _moderator;
    }

    modifier onlyOwnerOrModerator() {
        require(msg.sender == owner() || msg.sender == moderator, "not authorized");
        _;
    }

    modifier onlyJobRegistry() {
        require(msg.sender == address(jobRegistry), "not registry");
        _;
    }

    function setModerator(address _moderator) external onlyOwner {
        moderator = _moderator;
        emit ModeratorUpdated(_moderator);
    }

    function setDisputeFee(uint256 fee) external onlyOwner {
        disputeFee = fee;
        emit DisputeFeeUpdated(fee);
    }

    function setWindow(uint256 window) external onlyOwner {
        disputeWindow = window;
        emit DisputeWindowUpdated(window);
    }

    function raiseDispute(uint256 jobId) external onlyJobRegistry {
        address claimant = tx.origin;
        Dispute storage d = disputes[jobId];
        require(d.claimant == address(0), "disputed");
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        require(
            claimant == job.agent || claimant == job.employer,
            "not participant"
        );
        if (disputeFee > 0) {
            stakeManager.lockReward(claimant, disputeFee);
        }
        disputes[jobId] = Dispute({
            claimant: claimant,
            raisedAt: block.timestamp,
            fee: disputeFee
        });
        emit DisputeRaised(jobId, claimant);
    }

    function resolve(uint256 jobId, bool employerWins)
        external
        onlyOwnerOrModerator
    {
        Dispute memory d = disputes[jobId];
        require(d.claimant != address(0), "no dispute");
        require(block.timestamp >= d.raisedAt + disputeWindow, "window");
        delete disputes[jobId];
        jobRegistry.resolveDispute(jobId, employerWins);
        address recipient = employerWins
            ? jobRegistry.jobs(jobId).employer
            : d.claimant;
        if (d.fee > 0) {
            stakeManager.payReward(recipient, d.fee);
        }
        emit DisputeResolved(jobId, employerWins);
    }
}

