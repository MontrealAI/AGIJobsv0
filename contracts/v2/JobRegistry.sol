// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";
import {ICertificateNFT} from "./interfaces/ICertificateNFT.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";

/// @title JobRegistry
/// @notice Minimal registry coordinating job lifecycle and external modules.
contract JobRegistry is Ownable, IJobRegistry {
    uint256 public nextJobId;
    mapping(uint256 => IJobRegistry.Job) private _jobs;

    IValidationModule public validationModule;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IDisputeModule public disputeModule;
    ICertificateNFT public certificateNFT;

    uint128 public jobReward;
    uint96 public jobStake;

    // additional events not defined in interface
    event JobCancelled(uint256 indexed jobId);
    event DisputeRaised(uint256 indexed jobId, address indexed caller);

    constructor(address owner) Ownable(owner) {}

    /// @inheritdoc IJobRegistry
    function jobs(uint256 jobId) external view override returns (IJobRegistry.Job memory) {
        return _jobs[jobId];
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------
    function setModules(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certNFT
    ) external override onlyOwner {
        require(address(_validation) != address(0), "validation");
        require(address(_stakeMgr) != address(0), "stake");
        require(address(_reputation) != address(0), "reputation");
        require(address(_dispute) != address(0), "dispute");
        require(address(_certNFT) != address(0), "nft");

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

    function setJobParameters(uint256 reward, uint256 stake) external override onlyOwner {
        jobReward = uint128(reward);
        jobStake = uint96(stake);
        emit JobParametersUpdated(reward, stake);
    }

    // ---------------------------------------------------------------------
    // Job lifecycle
    // ---------------------------------------------------------------------
    function createJob() external override returns (uint256 jobId) {
        require(jobReward > 0 || jobStake > 0, "params not set");
        jobId = ++nextJobId;
        _jobs[jobId] = IJobRegistry.Job({
            employer: msg.sender,
            agent: address(0),
            reward: jobReward,
            stake: jobStake,
            state: IJobRegistry.State.Created,
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

    function applyForJob(uint256 jobId) external override {
        IJobRegistry.Job storage job = _jobs[jobId];
        require(job.state == IJobRegistry.State.Created, "not open");
        if (job.stake > 0 && address(stakeManager) != address(0)) {
            require(
                stakeManager.stakes(msg.sender) >= uint256(job.stake),
                "stake missing"
            );
        }
        job.agent = msg.sender;
        job.state = IJobRegistry.State.Applied;
        emit AgentApplied(jobId, msg.sender);
    }

    /// @notice Agent submits job result; validation outcome stored.
    function submit(uint256 jobId) public override {
        IJobRegistry.Job storage job = _jobs[jobId];
        require(job.state == IJobRegistry.State.Applied, "invalid state");
        require(msg.sender == job.agent, "only agent");
        bool outcome = validationModule.validate(jobId);
        job.success = outcome;
        job.state = IJobRegistry.State.Completed;
        emit JobSubmitted(jobId, outcome);
    }

    function completeJob(uint256 jobId) external {
        submit(jobId);
    }

    /// @notice Agent disputes a failed job outcome.
    function raiseDispute(uint256 jobId) public payable {
        IJobRegistry.Job storage job = _jobs[jobId];
        require(job.state == IJobRegistry.State.Completed && !job.success, "cannot dispute");
        require(msg.sender == job.agent, "only agent");
        job.state = IJobRegistry.State.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.appeal{value: msg.value}(jobId);
        } else {
            require(msg.value == 0, "fee unused");
        }
        emit DisputeRaised(jobId, msg.sender);
    }

    function dispute(uint256 jobId) external payable override {
        raiseDispute(jobId);
    }

    /// @notice Owner resolves a dispute, setting the final outcome.
    function resolveDispute(uint256 jobId, bool employerWins) external override {
        require(msg.sender == address(disputeModule), "only dispute");
        IJobRegistry.Job storage job = _jobs[jobId];
        require(job.state == IJobRegistry.State.Disputed, "no dispute");
        job.success = !employerWins;
        job.state = IJobRegistry.State.Completed;
    }

    /// @notice Finalize a job and trigger payouts and reputation changes.
    function finalize(uint256 jobId) external override {
        IJobRegistry.Job storage job = _jobs[jobId];
        require(job.state == IJobRegistry.State.Completed, "not ready");
        job.state = IJobRegistry.State.Finalized;
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
    function cancelJob(uint256 jobId) external override {
        IJobRegistry.Job storage job = _jobs[jobId];
        require(
            job.state == IJobRegistry.State.Created || job.state == IJobRegistry.State.Applied,
            "cannot cancel"
        );
        require(msg.sender == job.employer, "only employer");
        job.state = IJobRegistry.State.Cancelled;
        if (address(stakeManager) != address(0) && job.reward > 0) {
            stakeManager.payReward(job.employer, uint256(job.reward));
        }
        emit JobCancelled(jobId);
    }
}


