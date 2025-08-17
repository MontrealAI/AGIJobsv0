// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IValidationModule {
    function validate(uint256 jobId) external view returns (bool);
}

interface IReputationEngine {
    function onApply(address agent) external;
    function onFinalize(
        address agent,
        bool success,
        uint256 payout,
        uint256 completionTime
    ) external;
    function blacklist(address user, bool status) external;
    function isBlacklisted(address user) external view returns (bool);
}

interface IStakeManager {
    function lockReward(address from, uint256 amount) external;
    function payReward(address to, uint256 amount) external;
    function slash(address user, address recipient, uint256 amount) external;
    function releaseStake(address user, uint256 amount) external;
    function stakes(address user) external view returns (uint256);
}

interface IFeePool {
    function depositFee(uint256 amount) external;
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
        uint256 fee;
        bool success;
        Status status;
        string outputURI;
        uint256 createdAt;
    }

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    IValidationModule public validationModule;
    IReputationEngine public reputationEngine;
    IStakeManager public stakeManager;
    ICertificateNFT public certificateNFT;
    IDisputeModule public disputeModule;
    IFeePool public feePool;

    uint256 public jobReward;
    uint256 public jobStake;
    uint256 public feePct;
    bytes32 public agentRootNode;
    bytes32 public agentMerkleRoot;

    /// @notice tracks which addresses acknowledged the tax policy
    mapping(address => bool) private _taxAcknowledged;

    /// @notice emitted when a user acknowledges the tax policy
    event TaxPolicyAcknowledged(address indexed user);

    event ModuleUpdated(string module, address newAddress);
    event ValidationModuleUpdated(address module);
    event ReputationEngineUpdated(address engine);
    event StakeManagerUpdated(address manager);
    event CertificateNFTUpdated(address nft);
    event DisputeModuleUpdated(address module);
    event FeePoolUpdated(address pool);
    event FeePctUpdated(uint256 feePct);
    event AgentRootNodeUpdated(bytes32 node);
    event AgentMerkleRootUpdated(bytes32 root);

    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake,
        uint256 fee
    );
    event JobCompleted(uint256 indexed jobId, bool success);
    event JobDisputed(uint256 indexed jobId);
    event JobFinalized(uint256 indexed jobId, bool success);
    event JobParametersUpdated(uint256 reward, uint256 stake);

    constructor() Ownable(msg.sender) {}

    /// @notice require caller to acknowledge current tax policy
    modifier requiresTaxAcknowledgement() {
        if (msg.sender != owner()) {
            require(_taxAcknowledged[msg.sender], "acknowledge tax policy");
        }
        _;
    }

    /// @notice allow users to acknowledge the tax policy
    function acknowledgeTaxPolicy() external {
        _taxAcknowledged[msg.sender] = true;
        emit TaxPolicyAcknowledged(msg.sender);
    }

    /// @notice returns whether msg.sender has acknowledged the tax policy
    function isTaxExempt() external view returns (bool) {
        return _taxAcknowledged[msg.sender];
    }

    function setValidationModule(IValidationModule module) external onlyOwner {
        validationModule = module;
        emit ValidationModuleUpdated(address(module));
        emit ModuleUpdated("ValidationModule", address(module));
    }

    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
        emit ModuleUpdated("ReputationEngine", address(engine));
    }

    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
        emit ModuleUpdated("StakeManager", address(manager));
    }

    function setCertificateNFT(ICertificateNFT nft) external onlyOwner {
        certificateNFT = nft;
        emit CertificateNFTUpdated(address(nft));
        emit ModuleUpdated("CertificateNFT", address(nft));
    }

    function setDisputeModule(IDisputeModule module) external onlyOwner {
        disputeModule = module;
        emit DisputeModuleUpdated(address(module));
        emit ModuleUpdated("DisputeModule", address(module));
    }

    function setFeePool(IFeePool pool) external onlyOwner {
        feePool = pool;
        emit FeePoolUpdated(address(pool));
        emit ModuleUpdated("FeePool", address(pool));
    }

    function setFeePct(uint256 _feePct) external onlyOwner {
        require(_feePct <= 100, "pct");
        feePct = _feePct;
        emit FeePctUpdated(_feePct);
    }

    function setAgentRootNode(bytes32 node) external onlyOwner {
        agentRootNode = node;
        emit AgentRootNodeUpdated(node);
    }

    function setAgentMerkleRoot(bytes32 root) external onlyOwner {
        agentMerkleRoot = root;
        emit AgentMerkleRootUpdated(root);
    }

    function setModules(
        IValidationModule _validationModule,
        IReputationEngine _reputationEngine,
        IStakeManager _stakeManager,
        ICertificateNFT _certificateNFT,
        IDisputeModule _disputeModule
    ) external onlyOwner {
        validationModule = _validationModule;
        reputationEngine = _reputationEngine;
        stakeManager = _stakeManager;
        certificateNFT = _certificateNFT;
        disputeModule = _disputeModule;
        emit ValidationModuleUpdated(address(_validationModule));
        emit ModuleUpdated("ValidationModule", address(_validationModule));
        emit ReputationEngineUpdated(address(_reputationEngine));
        emit ModuleUpdated("ReputationEngine", address(_reputationEngine));
        emit StakeManagerUpdated(address(_stakeManager));
        emit ModuleUpdated("StakeManager", address(_stakeManager));
        emit CertificateNFTUpdated(address(_certificateNFT));
        emit ModuleUpdated("CertificateNFT", address(_certificateNFT));
        emit DisputeModuleUpdated(address(_disputeModule));
        emit ModuleUpdated("DisputeModule", address(_disputeModule));
    }

    function setJobParameters(uint256 reward, uint256 stake) external onlyOwner {
        jobReward = reward;
        jobStake = stake;
        emit JobParametersUpdated(reward, stake);
    }

    /// @notice Forward blacklist updates to the reputation engine.
    function blacklist(address user, bool status) external onlyOwner {
        reputationEngine.blacklist(user, status);
    }

    /// @notice Create a new job.
    function createJob(address agent)
        external
        requiresTaxAcknowledgement
        returns (uint256 jobId)
    {
        require(jobReward > 0 || jobStake > 0, "params not set");
        require(agent != msg.sender, "self");
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "blacklisted employer"
            );
            require(!reputationEngine.isBlacklisted(agent), "blacklisted agent");
            reputationEngine.onApply(agent);
        }
        require(stakeManager.stakes(agent) >= jobStake, "stake missing");
        jobId = ++nextJobId;
        uint256 fee = (jobReward * feePct) / 100;
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: agent,
            reward: jobReward,
            stake: jobStake,
            fee: fee,
            success: false,
            status: Status.Created,
            outputURI: "",
            createdAt: block.timestamp
        });
        stakeManager.lockReward(msg.sender, jobReward + fee);
        emit JobCreated(jobId, msg.sender, agent, jobReward, jobStake, fee);
    }

    /// @notice Agent submits job result; validation outcome stored.
    function completeJob(uint256 jobId, string calldata uri)
        external
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.status == Status.Created, "invalid status");
        require(msg.sender == job.agent, "only agent");
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "blacklisted agent"
            );
        }
        bool outcome = validationModule.validate(jobId);
        job.success = outcome;
        job.status = Status.Completed;
        job.outputURI = uri;
        emit JobCompleted(jobId, outcome);
    }

    /// @notice Agent disputes a failed job outcome.
    function dispute(uint256 jobId)
        external
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.status == Status.Completed && !job.success, "cannot dispute");
        require(msg.sender == job.agent, "only agent");
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "blacklisted agent"
            );
        }
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
    function finalize(uint256 jobId)
        external
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.status == Status.Completed, "not ready");
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "blacklisted"
            );
            require(
                !reputationEngine.isBlacklisted(job.agent),
                "blacklisted agent"
            );
            require(
                !reputationEngine.isBlacklisted(job.employer),
                "blacklisted employer"
            );
        }
        job.status = Status.Finalized;
        if (job.success) {
            uint256 payout = job.reward;
            IFeePool pool = feePool;
            uint256 fee = job.fee;
            if (address(pool) != address(0) && fee > 0) {
                stakeManager.payReward(address(pool), fee);
                pool.depositFee(fee);
                payout -= fee;
            }
            stakeManager.payReward(job.agent, payout);
            stakeManager.releaseStake(job.agent, job.stake);
            certificateNFT.mintCertificate(job.agent, jobId, job.outputURI);
        } else {
            stakeManager.payReward(job.employer, job.reward + job.fee);
            stakeManager.slash(job.agent, job.employer, job.stake);
        }
        uint256 duration = block.timestamp - job.createdAt;
        reputationEngine.onFinalize(job.agent, job.success, job.reward, duration);
        emit JobFinalized(jobId, job.success);
    }
}

