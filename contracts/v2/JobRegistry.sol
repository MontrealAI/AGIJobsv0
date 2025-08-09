// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {IJobRegistryTax} from "./interfaces/IJobRegistryTax.sol";

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
}

interface ICertificateNFT {
    function mint(address to, uint256 jobId, string calldata uri)
        external
        returns (uint256);
}

/// @title JobRegistry
/// @notice Orchestrates job lifecycle, module coordination and tax policy tracking.
contract JobRegistry is Ownable, ReentrancyGuard, IJobRegistryTax {
    enum Status {
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
        Status state;
    }

    // ---------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    IValidationModule public validationModule;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IDisputeModule public disputeModule;
    ICertificateNFT public certificateNFT;

    uint256 public jobReward;
    uint256 public jobStake;

    ITaxPolicy public taxPolicy;
    uint256 public override taxPolicyVersion;
    mapping(address => uint256) public override taxAcknowledgedVersion;

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event ValidationModuleUpdated(address module);
    event StakeManagerUpdated(address manager);
    event ReputationEngineUpdated(address engine);
    event DisputeModuleUpdated(address module);
    event CertificateNFTUpdated(address nft);
    event JobParametersUpdated(uint256 reward, uint256 stake);

    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake
    );
    event AgentApplied(uint256 indexed jobId, address indexed agent);
    event JobCompleted(uint256 indexed jobId, bool success);
    event DisputeRaised(uint256 indexed jobId, address indexed agent);
    event JobFinalized(uint256 indexed jobId, bool success);
    event JobCancelled(uint256 indexed jobId);

    event TaxPolicyUpdated(address policy, uint256 version);
    event TaxAcknowledged(
        address indexed user,
        uint256 version,
        string acknowledgement
    );

    constructor(address owner) Ownable(owner) {}

    // ---------------------------------------------------------------
    // Module wiring
    // ---------------------------------------------------------------

    function setValidationModule(address module) public onlyOwner {
        validationModule = IValidationModule(module);
        emit ValidationModuleUpdated(module);
    }

    function setStakeManager(address manager) public onlyOwner {
        stakeManager = IStakeManager(manager);
        emit StakeManagerUpdated(manager);
    }

    function setReputationEngine(address engine) public onlyOwner {
        reputationEngine = IReputationEngine(engine);
        emit ReputationEngineUpdated(engine);
    }

    function setDisputeModule(address module) public onlyOwner {
        disputeModule = IDisputeModule(module);
        emit DisputeModuleUpdated(module);
    }

    function setCertificateNFT(address nft) public onlyOwner {
        certificateNFT = ICertificateNFT(nft);
        emit CertificateNFTUpdated(nft);
    }

    function setModules(
        address validation,
        address stake,
        address reputation,
        address _dispute,
        address nft
    ) external onlyOwner {
        setValidationModule(validation);
        setStakeManager(stake);
        setReputationEngine(reputation);
        setDisputeModule(_dispute);
        setCertificateNFT(nft);
    }

    // ---------------------------------------------------------------
    // Job configuration
    // ---------------------------------------------------------------

    function setJobParameters(uint256 reward, uint256 stake) external onlyOwner {
        jobReward = reward;
        jobStake = stake;
        emit JobParametersUpdated(reward, stake);
    }

    // ---------------------------------------------------------------
    // Tax policy management
    // ---------------------------------------------------------------

    function setTaxPolicy(address policy) external onlyOwner {
        ITaxPolicy p = ITaxPolicy(policy);
        require(p.isTaxExempt(), "not tax exempt");
        taxPolicy = p;
        taxPolicyVersion = p.policyVersion();
        emit TaxPolicyUpdated(policy, taxPolicyVersion);
    }

    function bumpTaxPolicyVersion() external onlyOwner {
        taxPolicyVersion += 1;
        emit TaxPolicyUpdated(address(taxPolicy), taxPolicyVersion);
    }

    function acknowledgeTaxPolicy() external {
        require(address(taxPolicy) != address(0), "policy not set");
        string memory ack = taxPolicy.acknowledge();
        taxAcknowledgedVersion[msg.sender] = taxPolicyVersion;
        emit TaxAcknowledged(msg.sender, taxPolicyVersion, ack);
    }

    function taxAcknowledgement() external view returns (string memory) {
        return address(taxPolicy) == address(0)
            ? ""
            : taxPolicy.acknowledge();
    }

    function taxPolicyURI() external view returns (string memory) {
        return address(taxPolicy) == address(0)
            ? ""
            : taxPolicy.policyURI();
    }

    function taxPolicyDetails()
        external
        view
        returns (string memory ack, string memory uri)
    {
        if (address(taxPolicy) != address(0)) {
            (ack, uri) = taxPolicy.policyDetails();
        }
    }

    // ---------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------

    modifier requiresTaxAcknowledgement() {
        require(
            taxPolicyVersion != 0 &&
                taxAcknowledgedVersion[msg.sender] == taxPolicyVersion,
            "acknowledge tax policy"
        );
        _;
    }

    // ---------------------------------------------------------------
    // Job lifecycle
    // ---------------------------------------------------------------

    function createJob()
        external
        nonReentrant
        requiresTaxAcknowledgement
        returns (uint256 jobId)
    {
        require(jobReward > 0 || jobStake > 0, "params not set");
        jobId = ++nextJobId;
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: jobReward,
            stake: jobStake,
            success: false,
            state: Status.Created
        });
        if (jobReward > 0 && address(stakeManager) != address(0)) {
            stakeManager.lockReward(msg.sender, jobReward);
        }
        emit JobCreated(jobId, msg.sender, address(0), jobReward, jobStake);
    }

    function applyForJob(uint256 jobId)
        external
        nonReentrant
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.state == Status.Created, "invalid state");
        if (job.stake > 0 && address(stakeManager) != address(0)) {
            require(stakeManager.stakes(msg.sender) >= job.stake, "stake missing");
        }
        job.agent = msg.sender;
        job.state = Status.Applied;
        emit AgentApplied(jobId, msg.sender);
    }

    function completeJob(uint256 jobId)
        external
        nonReentrant
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.state == Status.Applied, "invalid state");
        require(msg.sender == job.agent, "only agent");
        bool outcome = validationModule.validate(jobId);
        job.success = outcome;
        job.state = Status.Completed;
        emit JobCompleted(jobId, outcome);
    }

    function dispute(uint256 jobId)
        external
        payable
        nonReentrant
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.state == Status.Completed && !job.success, "cannot dispute");
        require(msg.sender == job.agent, "only agent");
        job.state = Status.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.appeal{value: msg.value}(jobId);
        }
        emit DisputeRaised(jobId, msg.sender);
    }

    function resolveDispute(uint256 jobId, bool employerWins) external {
        require(msg.sender == address(disputeModule), "only dispute module");
        Job storage job = jobs[jobId];
        require(job.state == Status.Disputed, "no dispute");
        job.success = !employerWins;
        job.state = Status.Completed;
    }

    function finalize(uint256 jobId) public nonReentrant {
        Job storage job = jobs[jobId];
        require(job.state == Status.Completed, "not ready");
        require(
            msg.sender == job.employer || msg.sender == address(disputeModule),
            "only employer"
        );
        job.state = Status.Finalized;

        if (job.success) {
            if (job.reward > 0) {
                stakeManager.payReward(job.agent, job.reward);
            }
            if (job.stake > 0) {
                stakeManager.releaseStake(job.agent, job.stake);
            }
            if (address(reputationEngine) != address(0)) {
                reputationEngine.add(job.agent, 1);
            }
            if (address(certificateNFT) != address(0)) {
                certificateNFT.mint(job.agent, jobId, "");
            }
        } else {
            if (job.reward > 0) {
                stakeManager.payReward(job.employer, job.reward);
            }
            if (job.stake > 0) {
                stakeManager.slash(job.agent, job.employer, job.stake);
            }
            if (address(reputationEngine) != address(0)) {
                reputationEngine.subtract(job.agent, 1);
            }
        }

        emit JobFinalized(jobId, job.success);
    }

    function cancelJob(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.state == Status.Created, "invalid state");
        require(msg.sender == job.employer, "only employer");
        job.state = Status.Cancelled;
        if (job.reward > 0 && address(stakeManager) != address(0)) {
            stakeManager.payReward(job.employer, job.reward);
        }
        emit JobCancelled(jobId);
    }

    // ---------------------------------------------------------------
    // Tax neutrality helpers
    // ---------------------------------------------------------------

    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    receive() external payable {
        revert("JobRegistry: no ether");
    }

    fallback() external payable {
        revert("JobRegistry: no ether");
    }
}

