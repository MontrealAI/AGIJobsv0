// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";

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
/// @notice Coordinates job lifecycle and external modules.
/// @dev Tax obligations never accrue to this registry or its owner. All
/// liabilities remain with employers, agents, and validators as expressed by
/// the owner‑controlled `TaxPolicy` reference.
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
    ITaxPolicy public taxPolicy;

    uint128 public jobReward;
    uint96 public jobStake;

    // module configuration events
    event ValidationModuleUpdated(address module);
    event StakeManagerUpdated(address manager);
    event ReputationEngineUpdated(address engine);
    event DisputeModuleUpdated(address module);
    event CertificateNFTUpdated(address nft);
    event TaxPolicyUpdated(address policy);

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
    event JobCompleted(uint256 indexed jobId, bool success);
    event JobFinalized(uint256 indexed jobId, bool success);
    event JobCancelled(uint256 indexed jobId);
    event DisputeRaised(uint256 indexed jobId, address indexed caller);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);

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

    /// @notice Sets the TaxPolicy contract holding the canonical disclaimer.
    /// @dev Only callable by the owner; the policy address cannot be zero.
    function setTaxPolicy(ITaxPolicy _policy) external onlyOwner {
        require(address(_policy) != address(0), "policy");
        taxPolicy = _policy;
        emit TaxPolicyUpdated(address(_policy));
    }

    /// @notice Returns the on-chain acknowledgement string stating that all
    /// taxes are the responsibility of employers, agents, and validators.
    function taxAcknowledgement() external view returns (string memory) {
        if (address(taxPolicy) == address(0)) return "";
        return taxPolicy.acknowledge();
    }

    /// @notice Returns the URI pointing to the full off-chain tax policy.
    function taxPolicyURI() external view returns (string memory) {
        if (address(taxPolicy) == address(0)) return "";
        return taxPolicy.policyURI();
    }

    /// @notice Convenience helper returning both acknowledgement and URI.
    /// @return ack Plain-text disclaimer confirming tax responsibilities.
    /// @return uri Off-chain document location (e.g., IPFS hash).
    function taxPolicyDetails()
        external
        view
        returns (string memory ack, string memory uri)
    {
        if (address(taxPolicy) == address(0)) return ("", "");
        (ack, uri) = taxPolicy.policyDetails();
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
        require(jobReward > 0 || jobStake > 0, "params not set");
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
        require(job.state == State.Created, "not open");
        if (job.stake > 0 && address(stakeManager) != address(0)) {
            require(
                stakeManager.stakes(msg.sender) >= uint256(job.stake),
                "stake missing"
            );
        }
        job.agent = msg.sender;
        job.state = State.Applied;
        emit AgentApplied(jobId, msg.sender);
    }

    /// @notice Agent completes the job; validation outcome stored.
    function completeJob(uint256 jobId) public {
        Job storage job = jobs[jobId];
        require(job.state == State.Applied, "invalid state");
        require(msg.sender == job.agent, "only agent");
        bool outcome = validationModule.validate(jobId);
        job.success = outcome;
        job.state = State.Completed;
        emit JobCompleted(jobId, outcome);
    }

    /// @notice Agent disputes a failed job outcome.
    function raiseDispute(uint256 jobId) public payable {
        Job storage job = jobs[jobId];
        require(job.state == State.Completed && !job.success, "cannot dispute");
        require(msg.sender == job.agent, "only agent");
        job.state = State.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.appeal{value: msg.value}(jobId);
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
        emit DisputeResolved(jobId, employerWins);
    }

    /// @notice Finalize a job and trigger payouts and reputation changes.
    function finalize(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.state == State.Completed, "not ready");
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
        require(
            job.state == State.Created || job.state == State.Applied,
            "cannot cancel"
        );
        require(msg.sender == job.employer, "only employer");
        job.state = State.Cancelled;
        if (address(stakeManager) != address(0) && job.reward > 0) {
            stakeManager.payReward(job.employer, uint256(job.reward));
        }
        emit JobCancelled(jobId);
    }

    // ---------------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------------
    /// @dev Prevent accidental ETH transfers; this registry never holds funds
    /// and cannot accrue tax liabilities. All value flows through the
    /// StakeManager or DisputeModule according to participant actions.
    receive() external payable {
        revert("JobRegistry: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("JobRegistry: no ether");
    }
}


