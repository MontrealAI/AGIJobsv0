// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IValidationModule {
    function validate(uint256 jobId) external view returns (bool);
}

interface IReputationEngine {
    function addReputation(address user, uint256 amount) external;
    function subtractReputation(address user, uint256 amount) external;
}

interface IStakeManager {
    function lockReward(address from, uint256 amount) external;
    function payReward(address to, uint256 amount) external;
    function slash(address user, address recipient, uint256 amount) external;
    function releaseStake(address user, uint256 amount) external;
    function stakes(address user) external view returns (uint256);
}

interface ICertificateNFT {
    function mintCertificate(
        address to,
        uint256 jobId,
        string calldata uri
    ) external returns (uint256);
}

interface IDisputeModule {
    function raiseDispute(uint256 jobId) external;
    function resolve(uint256 jobId, bool employerWins) external;
}

/// @title JobRegistry
/// @notice Orchestrates job lifecycle and coordinates with external modules.
contract JobRegistry is Ownable {
    enum Status { None, Created, Completed, Disputed, Finalized }

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
    IReputationEngine public reputationEngine;
    IStakeManager public stakeManager;
    ICertificateNFT public certificateNFT;
    IDisputeModule public disputeModule;

    event ValidationModuleUpdated(address module);
    event ReputationEngineUpdated(address engine);
    event StakeManagerUpdated(address manager);
    event CertificateNFTUpdated(address nft);
    event DisputeModuleUpdated(address module);

    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake
    );
    event JobCompleted(uint256 indexed jobId, bool success);
    event JobDisputed(uint256 indexed jobId);
    event JobFinalized(uint256 indexed jobId, bool success);

    constructor(address owner) Ownable(owner) {}

    function setValidationModule(IValidationModule module) external onlyOwner {
        validationModule = module;
        emit ValidationModuleUpdated(address(module));
    }

    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
    }

    function setCertificateNFT(ICertificateNFT nft) external onlyOwner {
        certificateNFT = nft;
        emit CertificateNFTUpdated(address(nft));
    }

    function setDisputeModule(IDisputeModule module) external onlyOwner {
        disputeModule = module;
        emit DisputeModuleUpdated(address(module));
    }

    /// @notice Create a new job.
    function createJob(address agent, uint256 reward, uint256 stake)
        external
        returns (uint256 jobId)
    {
        require(stakeManager.stakes(agent) >= stake, "stake missing");
        jobId = ++nextJobId;
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: agent,
            reward: reward,
            stake: stake,
            success: false,
            status: Status.Created
        });
        stakeManager.lockReward(msg.sender, reward);
        emit JobCreated(jobId, msg.sender, agent, reward, stake);
    }

    /// @notice Agent submits job result; validation outcome stored.
    function completeJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == Status.Created, "invalid status");
        require(msg.sender == job.agent, "only agent");
        bool outcome = validationModule.validate(jobId);
        job.success = outcome;
        job.status = Status.Completed;
        emit JobCompleted(jobId, outcome);
    }

    /// @notice Agent disputes a failed job outcome.
    function dispute(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == Status.Completed && !job.success, "cannot dispute");
        require(msg.sender == job.agent, "only agent");
        job.status = Status.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute(jobId);
        }
        emit JobDisputed(jobId);
    }

    /// @notice Owner resolves a dispute, setting the final outcome.
    function resolveDispute(uint256 jobId, bool success) external onlyOwner {
        Job storage job = jobs[jobId];
        require(job.status == Status.Disputed, "no dispute");
        job.success = success;
        job.status = Status.Completed;
        if (address(disputeModule) != address(0)) {
            disputeModule.resolve(jobId, !success);
        }
    }

    /// @notice Finalize a job and trigger payouts and reputation changes.
    function finalize(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == Status.Completed, "not ready");
        job.status = Status.Finalized;
        if (job.success) {
            stakeManager.payReward(job.agent, job.reward);
            stakeManager.releaseStake(job.agent, job.stake);
            reputationEngine.addReputation(job.agent, 1);
            certificateNFT.mintCertificate(job.agent, jobId, "");
        } else {
            stakeManager.payReward(job.employer, job.reward);
            stakeManager.slash(job.agent, job.employer, job.stake);
            reputationEngine.subtractReputation(job.agent, 1);
        }
        emit JobFinalized(jobId, job.success);
    }
}

