// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IValidationModule {
    function validate(uint256 jobId) external view returns (bool);
}

interface IStakeManager {
    function lockReward(address from, uint256 amount) external;
    function payReward(address to, uint256 amount) external;
    function slash(address user, address recipient, uint256 amount) external;
    function releaseStake(address user, uint256 amount) external;
}

interface IReputationEngine {
    function addReputation(address user, uint256 amount) external;
    function subtractReputation(address user, uint256 amount) external;
}

interface IDisputeModule {
    function raiseDispute(uint256 jobId) external payable;
}

interface ICertificateNFT {
    function mintCertificate(address to, uint256 jobId, string calldata uri)
        external
        returns (uint256);
}

/// @title JobRegistry
/// @notice Minimal registry coordinating job lifecycle and external modules.
contract JobRegistry is Ownable {
    enum State { None, Created, Applied, Completed, Disputed, Finalized }

    struct Job {
        address agent;
        address employer;
        uint256 reward;
        State state;
    }

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;
    mapping(uint256 => bool) public jobSuccess;

    IValidationModule public validation;
    IStakeManager public stakeMgr;
    IReputationEngine public reputation;
    IDisputeModule public disputeModule;
    ICertificateNFT public certNFT;

    event JobCreated(uint256 indexed jobId, address indexed employer, uint256 reward);
    event JobCompleted(uint256 indexed jobId, bool success);
    event JobDisputed(uint256 indexed jobId);
    event JobFinalized(uint256 indexed jobId, bool success);

    constructor(address owner) Ownable(owner) {}

    function setModules(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certNFT
    ) external onlyOwner {
        validation = _validation;
        stakeMgr = _stakeMgr;
        reputation = _reputation;
        disputeModule = _dispute;
        certNFT = _certNFT;
    }

    function createJob(uint256 reward) external returns (uint256 jobId) {
        jobId = ++nextJobId;
        jobs[jobId] = Job({
            agent: address(0),
            employer: msg.sender,
            reward: reward,
            state: State.Created
        });
        if (address(stakeMgr) != address(0)) {
            stakeMgr.lockReward(msg.sender, reward);
        }
        emit JobCreated(jobId, msg.sender, reward);
    }

    function applyForJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.state == State.Created, "not open");
        job.agent = msg.sender;
        job.state = State.Applied;
    }

    function completeJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.state == State.Applied, "invalid state");
        require(msg.sender == job.agent, "only agent");
        bool success = validation.validate(jobId);
        jobSuccess[jobId] = success;
        job.state = State.Completed;
        emit JobCompleted(jobId, success);
    }

    function dispute(uint256 jobId) external payable {
        Job storage job = jobs[jobId];
        require(job.state == State.Completed, "not completed");
        require(!jobSuccess[jobId], "already successful");
        require(msg.sender == job.agent || msg.sender == job.employer, "not participant");
        job.state = State.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute{value: msg.value}(jobId);
        } else {
            require(msg.value == 0, "fee unused");
        }
        emit JobDisputed(jobId);
    }

    function resolveDispute(uint256 jobId, bool employerWins) external {
        require(msg.sender == address(disputeModule), "only dispute");
        Job storage job = jobs[jobId];
        require(job.state == State.Disputed, "not disputed");
        jobSuccess[jobId] = !employerWins;
        job.state = State.Completed;
    }

    function finalize(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.state == State.Completed, "not ready");
        job.state = State.Finalized;
        if (jobSuccess[jobId]) {
            if (address(stakeMgr) != address(0)) {
                stakeMgr.payReward(job.agent, job.reward);
                stakeMgr.releaseStake(job.agent, job.reward * 2);
            }
            if (address(reputation) != address(0)) {
                reputation.addReputation(job.agent, 1);
            }
            if (address(certNFT) != address(0)) {
                certNFT.mintCertificate(job.agent, jobId, "");
            }
        } else {
            if (address(stakeMgr) != address(0)) {
                stakeMgr.payReward(job.employer, job.reward);
                stakeMgr.slash(job.agent, job.employer, job.reward);
            }
            if (address(reputation) != address(0)) {
                reputation.subtractReputation(job.agent, 1);
            }
        }
        emit JobFinalized(jobId, jobSuccess[jobId]);
    }
}

