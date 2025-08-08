// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

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
    function appeal(uint256 jobId) external payable;
    function resolve(uint256 jobId, bool employerWins) external;
}

interface ICertificateNFT {
    function mint(address to, uint256 jobId, string calldata uri) external returns (uint256);
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
        uint128 reward;
        uint96 stake;
        State state;
        bool success;
    }

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    IValidationModule public validationModule;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IDisputeModule public disputeModule;
    ICertificateNFT public certificateNFT;

    uint128 public jobReward;
    uint96 public jobStake;

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

    /// @notice Error thrown when module address is zero
    error InvalidModuleAddress();
    /// @notice Error thrown when job parameters are not set
    error ParamsNotSet();
    /// @notice Error thrown when job is not open for applications
    error NotOpen();
    /// @notice Error thrown when caller lacks required stake
    error StakeMissing();
    /// @notice Error thrown when job is in invalid state
    error InvalidState();
    /// @notice Error thrown when caller is not the assigned agent
    error OnlyAgent();
    /// @notice Error thrown when dispute cannot be raised
    error CannotDispute();
    /// @notice Error thrown when message value should be zero
    error FeeUnused();
    /// @notice Error thrown when caller is not dispute module
    error OnlyDisputeModule();
    /// @notice Error thrown when no dispute exists
    error NoDispute();
    /// @notice Error thrown when job is not ready for finalization
    error NotReady();
    /// @notice Error thrown when job cannot be cancelled
    error CannotCancel();
    /// @notice Error thrown when caller is not the employer
    error OnlyEmployer();

    constructor(address owner) Ownable(owner) {}

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------
    function setModules(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certNFT
    ) external onlyOwner {
        if (address(_validation) == address(0) || address(_stakeMgr) == address(0) ||
            address(_reputation) == address(0) || address(_dispute) == address(0) ||
            address(_certNFT) == address(0)) revert InvalidModuleAddress();

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
        jobReward = uint128(reward);
        jobStake = uint96(stake);
        emit JobParametersUpdated(reward, stake);
    }

    // ---------------------------------------------------------------------
    // Job lifecycle
    // ---------------------------------------------------------------------
    function createJob() external returns (uint256 jobId) {
        if (jobReward == 0 && jobStake == 0) revert ParamsNotSet();
        jobId = ++nextJobId;
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: jobReward,
            stake: jobStake,
            state: State.Created,
            success: false
        });
        if (address(stakeManager) != address(0) && jobReward > 0) {
            stakeManager.lockReward(msg.sender, uint256(jobReward));
        }
        emit JobCreated(
            jobId,
            msg.sender,
            address(0),
            uint256(jobReward),
            uint256(jobStake)
        );
    }

    function applyForJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.state != State.Created) revert NotOpen();
        if (job.stake > 0 && address(stakeManager) != address(0)) {
            if (stakeManager.stakes(msg.sender) < uint256(job.stake)) {
                revert StakeMissing();
            }
        }
        job.agent = msg.sender;
        job.state = State.Applied;
        emit AgentApplied(jobId, msg.sender);
    }

    /// @notice Agent submits job result; validation outcome stored.
    function submit(uint256 jobId) public {
        Job storage job = jobs[jobId];
        if (job.state != State.Applied) revert InvalidState();
        if (msg.sender != job.agent) revert OnlyAgent();
        bool outcome = validationModule.validate(jobId);
        job.success = outcome;
        job.state = State.Completed;
        emit JobSubmitted(jobId, outcome);
    }

    /// @notice Agent disputes a failed job outcome.
    function raiseDispute(uint256 jobId) public payable {
        Job storage job = jobs[jobId];
        if (job.state != State.Completed || job.success) revert CannotDispute();
        if (msg.sender != job.agent) revert OnlyAgent();
        job.state = State.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.appeal{value: msg.value}(jobId);
        } else {
            if (msg.value != 0) revert FeeUnused();
        }
        emit DisputeRaised(jobId, msg.sender);
    }

    function dispute(uint256 jobId) external payable {
        raiseDispute(jobId);
    }

    /// @notice Owner resolves a dispute, setting the final outcome.
    function resolveDispute(uint256 jobId, bool employerWins) external {
        if (msg.sender != address(disputeModule)) revert OnlyDisputeModule();
        Job storage job = jobs[jobId];
        if (job.state != State.Disputed) revert NoDispute();
        job.success = !employerWins;
        job.state = State.Completed;
    }

    /// @notice Finalize a job and trigger payouts and reputation changes.
    function finalize(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.state != State.Completed) revert NotReady();
        job.state = State.Finalized;
        if (job.success) {
            if (address(stakeManager) != address(0)) {
                if (job.reward > 0) {
                    stakeManager.payReward(job.agent, uint256(job.reward));
                }
                if (job.stake > 0) {
                    stakeManager.releaseStake(job.agent, uint256(job.stake));
                }
            }
            if (address(reputationEngine) != address(0)) {
                reputationEngine.add(job.agent, 1);
            }
            if (address(certificateNFT) != address(0)) {
                certificateNFT.mint(job.agent, jobId, "");
            }
        } else {
            if (address(stakeManager) != address(0)) {
                if (job.reward > 0) {
                    stakeManager.payReward(job.employer, uint256(job.reward));
                }
                if (job.stake > 0) {
                    stakeManager.slash(
                        job.agent,
                        job.employer,
                        uint256(job.stake)
                    );
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
        if (job.state != State.Created && job.state != State.Applied) revert CannotCancel();
        if (msg.sender != job.employer) revert OnlyEmployer();
        job.state = State.Cancelled;
        if (address(stakeManager) != address(0) && job.reward > 0) {
            stakeManager.payReward(job.employer, uint256(job.reward));
        }
        emit JobCancelled(jobId);
    }
}


