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
    function stakes(address user) external view returns (uint256);
}

interface IReputationEngine {
    function add(address user, uint256 amount) external;
    function subtract(address user, uint256 amount) external;
}

interface IDisputeModule {
    function raiseDispute(uint256 jobId) external payable;
    function resolve(uint256 jobId, bool employerWins) external;
}

interface ICertificateNFT {
    function mintCertificate(address to, uint256 jobId, string calldata uri)
        external
        returns (uint256);
}

/// @title JobRegistry
/// @notice Minimal registry coordinating job lifecycle and external modules.
contract JobRegistry is Ownable {
    enum State {
        None,
        Created,
        Applied,
        Completed,
        Disputed,
        Finalized,
        Cancelled
    }

    struct Job {
        address employer;
        address agent;
        uint256 reward;
        uint256 stake;
        bool success;
        State state;
    }

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    IValidationModule public validationModule;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IDisputeModule public disputeModule;
    ICertificateNFT public certificateNFT;

    uint256 public jobReward;
    uint256 public jobStake;

    // module configuration events
    event ValidationModuleUpdated(address module);
    event StakeManagerUpdated(address manager);
    event ReputationEngineUpdated(address engine);
    event DisputeModuleUpdated(address module);
    event CertificateNFTUpdated(address nft);

    // job parameter template event
    event JobParametersUpdated(uint256 reward, uint256 stake);

    // job lifecycle events
    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake
    );
    event AgentApplied(uint256 indexed jobId, address indexed agent);
    event JobSubmitted(uint256 indexed jobId, bool success);
    event JobFinalized(uint256 indexed jobId, bool success);
    event JobCancelled(uint256 indexed jobId);
    event DisputeRaised(uint256 indexed jobId, address indexed caller);

    constructor(address owner) Ownable(owner) {}

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------
    function setValidationModule(IValidationModule module) external onlyOwner {
        validationModule = module;
        emit ValidationModuleUpdated(address(module));
    }

    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
    }

    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    function setDisputeModule(IDisputeModule module) external onlyOwner {
        disputeModule = module;
        emit DisputeModuleUpdated(address(module));
    }

    function setCertificateNFT(ICertificateNFT nft) external onlyOwner {
        certificateNFT = nft;
        emit CertificateNFTUpdated(address(nft));
    }

    function setModules(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certNFT
    ) external onlyOwner {
        validationModule = _validation;
        stakeManager = _stakeMgr;
        reputationEngine = _reputation;
        disputeModule = _dispute;
        certificateNFT = _certNFT;
        emit ValidationModuleUpdated(address(_validation));
        emit StakeManagerUpdated(address(_stakeMgr));
        emit ReputationEngineUpdated(address(_reputation));
        emit DisputeModuleUpdated(address(_dispute));
        emit CertificateNFTUpdated(address(_certNFT));
    }

    function setJobParameters(uint256 reward, uint256 stake) external onlyOwner {
        jobReward = reward;
        jobStake = stake;
        emit JobParametersUpdated(reward, stake);
    }

    // ---------------------------------------------------------------------
    // Job lifecycle
    // ---------------------------------------------------------------------
    function createJob() external returns (uint256 jobId) {
        require(jobReward > 0 || jobStake > 0, "params not set");
        jobId = ++nextJobId;
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: jobReward,
            stake: jobStake,
            success: false,
            state: State.Created
        });
        if (address(stakeManager) != address(0) && jobReward > 0) {
            stakeManager.lockReward(msg.sender, jobReward);
        }
        emit JobCreated(jobId, msg.sender, address(0), jobReward, jobStake);
    }

    function applyForJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.state == State.Created, "not open");
        if (job.stake > 0 && address(stakeManager) != address(0)) {
            require(
                stakeManager.stakes(msg.sender) >= job.stake,
                "stake missing"
            );
        }
        job.agent = msg.sender;
        job.state = State.Applied;
        emit AgentApplied(jobId, msg.sender);
    }

    /// @notice Agent submits job result; validation outcome stored.
    function submit(uint256 jobId) public {
        Job storage job = jobs[jobId];
        require(job.state == State.Applied, "invalid state");
        require(msg.sender == job.agent, "only agent");
        bool outcome = validationModule.validate(jobId);
        job.success = outcome;
        job.state = State.Completed;
        emit JobSubmitted(jobId, outcome);
    }

    function completeJob(uint256 jobId) external {
        submit(jobId);
    }

    /// @notice Agent disputes a failed job outcome.
    function raiseDispute(uint256 jobId) public payable {
        Job storage job = jobs[jobId];
        require(job.state == State.Completed && !job.success, "cannot dispute");
        require(msg.sender == job.agent, "only agent");
        job.state = State.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute{value: msg.value}(jobId);
        } else {
            require(msg.value == 0, "fee unused");
        }
        emit DisputeRaised(jobId, msg.sender);
    }

    function dispute(uint256 jobId) external payable {
        raiseDispute(jobId);
    }

    /// @notice Owner resolves a dispute, setting the final outcome.
    function resolveDispute(uint256 jobId, bool employerWins) external {
        require(msg.sender == address(disputeModule), "only dispute");
        Job storage job = jobs[jobId];
        require(job.state == State.Disputed, "no dispute");
        job.success = !employerWins;
        job.state = State.Completed;
    }

    /// @notice Finalize a job and trigger payouts and reputation changes.
    function finalize(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.state == State.Completed, "not ready");
        job.state = State.Finalized;
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
                reputationEngine.add(job.agent, 1);
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
                reputationEngine.subtract(job.agent, 1);
            }
        }
        emit JobFinalized(jobId, job.success);
    }

    /// @notice Cancel a job before completion and refund the employer.
    function cancelJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(
            job.state == State.Created || job.state == State.Applied,
            "cannot cancel"
        );
        require(msg.sender == job.employer, "only employer");
        job.state = State.Cancelled;
        if (address(stakeManager) != address(0) && job.reward > 0) {
            stakeManager.payReward(job.employer, job.reward);
        }
        emit JobCancelled(jobId);
    }
}


