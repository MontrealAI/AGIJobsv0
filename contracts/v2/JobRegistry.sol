// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IValidationModule {
    function validate(uint256 jobId) external view returns (bool);
}

interface IStakeManager {
    function lockReward(address from, uint256 amount) external;
    function payReward(address to, uint256 amount) external;
    function slash(address user, address recipient, uint256 amount) external;
    function releaseStake(address user, uint256 amount) external;
    function stakes(address user) external view returns (uint256);
}

interface IReputationEngine {
    function addReputation(address user, uint256 amount) external;
    function subtractReputation(address user, uint256 amount) external;
}

interface IDisputeModule {
    function raiseDispute(uint256 jobId) external;
    function resolve(uint256 jobId, bool employerWins) external;
}

interface ICertificateNFT {
    function mintCertificate(
        address to,
        uint256 jobId,
        string calldata uri
    ) external returns (uint256);
}

/// @title JobRegistry
/// @notice Tracks job lifecycle and coordinates with external modules.
contract JobRegistry is Ownable, ReentrancyGuard {
    enum Status {
        None,
        Created,
        Applied,
        Submitted,
        Disputed,
        Finalized
    }

    struct Job {
        address employer;
        address agent;
        uint256 reward;
        uint256 stake;
        bool success;
        Status status;
    }

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    IValidationModule public validationModule;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IDisputeModule public disputeModule;
    ICertificateNFT public certificateNFT;

    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        uint256 reward,
        uint256 stake
    );
    event JobApplied(uint256 indexed jobId, address indexed agent);
    event JobSubmitted(uint256 indexed jobId, bool success);
    event JobFinalized(uint256 indexed jobId, bool success);
    event JobDisputed(uint256 indexed jobId);
    event ModuleUpdated(string module, address implementation);

    constructor(address owner) Ownable(owner) {}

    function setModules(
        IValidationModule _validation,
        IStakeManager _stake,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certificate
    ) external onlyOwner {
        validationModule = _validation;
        stakeManager = _stake;
        reputationEngine = _reputation;
        disputeModule = _dispute;
        certificateNFT = _certificate;
        emit ModuleUpdated("validation", address(_validation));
        emit ModuleUpdated("stake", address(_stake));
        emit ModuleUpdated("reputation", address(_reputation));
        emit ModuleUpdated("dispute", address(_dispute));
        emit ModuleUpdated("certificate", address(_certificate));
    }

    function createJob(uint256 reward, uint256 stake)
        external
        nonReentrant
        returns (uint256 jobId)
    {
        jobId = ++nextJobId;
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: reward,
            stake: stake,
            success: false,
            status: Status.Created
        });
        if (reward > 0 && address(stakeManager) != address(0)) {
            stakeManager.lockReward(msg.sender, reward);
        }
        emit JobCreated(jobId, msg.sender, reward, stake);
    }

    function applyForJob(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == Status.Created, "not open");
        if (job.stake > 0 && address(stakeManager) != address(0)) {
            require(stakeManager.stakes(msg.sender) >= job.stake, "stake missing");
        }
        job.agent = msg.sender;
        job.status = Status.Applied;
        emit JobApplied(jobId, msg.sender);
    }

    function submitJob(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == Status.Applied, "invalid state");
        require(msg.sender == job.agent, "only agent");
        bool outcome = validationModule.validate(jobId);
        job.success = outcome;
        job.status = Status.Submitted;
        emit JobSubmitted(jobId, outcome);
    }

    function dispute(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == Status.Submitted && !job.success, "cannot dispute");
        require(msg.sender == job.agent, "only agent");
        job.status = Status.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute(jobId);
        }
        emit JobDisputed(jobId);
    }

    function finalize(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(
            job.status == Status.Submitted || job.status == Status.Disputed,
            "not ready"
        );
        bool wasDisputed = job.status == Status.Disputed;
        job.status = Status.Finalized;
        if (wasDisputed && address(disputeModule) != address(0)) {
            disputeModule.resolve(jobId, !job.success);
        }
        if (job.success) {
            if (address(stakeManager) != address(0)) {
                if (job.reward > 0) {
                    stakeManager.payReward(job.agent, job.reward);
                }
                if (job.stake > 0) {
                    stakeManager.releaseStake(job.agent, job.stake);
                }
            }
            if (address(reputationEngine) != address(0)) {
                reputationEngine.addReputation(job.agent, 1);
            }
            if (address(certificateNFT) != address(0)) {
                certificateNFT.mintCertificate(job.agent, jobId, "");
            }
        } else {
            if (address(stakeManager) != address(0)) {
                if (job.reward > 0) {
                    stakeManager.payReward(job.employer, job.reward);
                }
                if (job.stake > 0) {
                    stakeManager.slash(job.agent, job.employer, job.stake);
                }
            }
            if (address(reputationEngine) != address(0)) {
                reputationEngine.subtractReputation(job.agent, 1);
            }
        }
        emit JobFinalized(jobId, job.success);
    }
}

