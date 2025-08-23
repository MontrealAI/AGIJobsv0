// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IValidationModule {
    function validate(uint256 jobId) external view returns (bool);
    function selectValidators(uint256 jobId) external returns (address[] memory);
}

interface IReputationEngine {
    function add(address user, uint256 amount) external;
    function subtract(address user, uint256 amount) external;
    function isBlacklisted(address user) external view returns (bool);
}

interface IStakeManager {
    function lockReward(address from, uint256 amount) external;
    function payReward(address to, uint256 amount) external;
    enum Role { Agent, Validator, Platform }
    function slash(address user, Role role, uint256 amount, address employer) external;
    function releaseStake(address user, uint256 amount) external;
    function stakes(address user) external view returns (uint256);
}

interface IFeePool {
    function depositFee(uint256 amount) external;
}

interface ICertificateNFT {
    function mint(
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
contract JobRegistry is Ownable, Pausable {
    using SafeERC20 for IERC20;
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
    uint256 public jobDuration;
    uint256 public feePct;
    uint256 public maxJobReward;
    uint256 public maxJobDuration;
    bytes32 public agentRootNode;
    bytes32 public agentMerkleRoot;

    /// @notice manually permitted agents bypassing ENS/Merkle checks
    mapping(address => bool) public additionalAgents;

    /// @notice tracks which addresses acknowledged the tax policy
    mapping(address => bool) private _taxAcknowledged;

    /// @notice emitted when a user acknowledges the tax policy
    event TaxPolicyAcknowledged(address indexed user);

    event ModuleUpdated(string module, address newAddress);
    event ModulesUpdated(
        address validationModule,
        address reputationEngine,
        address stakeManager,
        address certificateNFT,
        address disputeModule
    );
    event ValidationModuleUpdated(address module);
    event ReputationEngineUpdated(address engine);
    event StakeManagerUpdated(address manager);
    event CertificateNFTUpdated(address nft);
    event DisputeModuleUpdated(address module);
    event FeePoolUpdated(address pool);
    event FeePctUpdated(uint256 feePct);
    event MaxJobRewardUpdated(uint256 maxReward);
    event MaxJobDurationUpdated(uint256 maxDuration);
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    /// @notice Emitted when the ENS root node for agents changes.
    /// @param node The new ENS root node.
    event AgentRootNodeUpdated(bytes32 node);
    /// @notice Emitted when the agent allowlist Merkle root changes.
    /// @param root The new Merkle root.
    event AgentMerkleRootUpdated(bytes32 root);

    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake,
        uint256 fee
    );
    event JobApplied(uint256 indexed jobId, address indexed agent);
    event JobSubmitted(uint256 indexed jobId, address indexed agent, string uri);
    event JobCompleted(uint256 indexed jobId, bool success);
    event JobDisputed(uint256 indexed jobId);
    event JobFinalized(uint256 indexed jobId, bool success);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event JobCancelled(uint256 indexed jobId);
    event JobDelisted(uint256 indexed jobId);
    event JobParametersUpdated(uint256 reward, uint256 stake, uint256 duration);

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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
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

    /// @notice Update the ENS root node for agent identities.
    /// @param node Namehash of the agent parent node (e.g. `agent.agi.eth`).
    function setAgentRootNode(bytes32 node) external onlyOwner {
        agentRootNode = node;
        emit AgentRootNodeUpdated(node);
    }

    /// @notice Update the Merkle root for the agent allowlist.
    /// @param root Merkle root of approved agent addresses.
    function setAgentMerkleRoot(bytes32 root) external onlyOwner {
        agentMerkleRoot = root;
        emit AgentMerkleRootUpdated(root);
    }

    /// @notice Manually allow an agent to bypass identity checks.
    /// @param agent Address to whitelist.
    function addAdditionalAgent(address agent) external onlyOwner {
        require(agent != address(0), "agent");
        if (address(reputationEngine) != address(0)) {
            require(!reputationEngine.isBlacklisted(agent), "blacklisted");
        }
        additionalAgents[agent] = true;
        emit AdditionalAgentUpdated(agent, true);
    }

    /// @notice Remove an agent from the manual allowlist.
    /// @param agent Address to remove.
    function removeAdditionalAgent(address agent) external onlyOwner {
        additionalAgents[agent] = false;
        emit AdditionalAgentUpdated(agent, false);
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
        emit ModulesUpdated(
            address(_validationModule),
            address(_reputationEngine),
            address(_stakeManager),
            address(_certificateNFT),
            address(_disputeModule)
        );
    }

    function setJobParameters(
        uint256 reward,
        uint256 stake,
        uint256 duration
    ) external onlyOwner {
        require(maxJobReward == 0 || reward <= maxJobReward, "reward too high");
        require(maxJobDuration == 0 || duration <= maxJobDuration, "duration too long");
        jobReward = reward;
        jobStake = stake;
        jobDuration = duration;
        emit JobParametersUpdated(reward, stake, duration);
    }

    function setMaxJobReward(uint256 maxReward) external onlyOwner {
        maxJobReward = maxReward;
        emit MaxJobRewardUpdated(maxReward);
    }

    function setMaxJobDuration(uint256 maxDuration) external onlyOwner {
        maxJobDuration = maxDuration;
        emit MaxJobDurationUpdated(maxDuration);
    }

    /// @notice Create a new job.
    function createJob()
        external
        requiresTaxAcknowledgement
        whenNotPaused
        returns (uint256 jobId)
    {
        require(jobReward > 0 || jobStake > 0, "params not set");
        require(maxJobReward == 0 || jobReward <= maxJobReward, "reward too high");
        require(maxJobDuration == 0 || jobDuration <= maxJobDuration, "duration too long");
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "blacklisted employer"
            );
        }
        jobId = ++nextJobId;
        uint256 fee = (jobReward * feePct) / 100;
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: jobReward,
            stake: jobStake,
            fee: fee,
            success: false,
            status: Status.Created,
            outputURI: "",
            deadline: block.timestamp + jobDuration
        });
        stakeManager.lockReward(msg.sender, jobReward + fee);
        emit JobCreated(jobId, msg.sender, address(0), jobReward, jobStake, fee);
    }

    function _applyForJob(uint256 jobId) internal {
        Job storage job = jobs[jobId];
        require(job.status == Status.Created, "not open");
        require(job.agent == address(0), "taken");
        require(msg.sender != job.employer, "self");
        if (address(reputationEngine) != address(0)) {
            require(!reputationEngine.isBlacklisted(msg.sender), "blacklisted agent");
        }
        require(additionalAgents[msg.sender], "unauthorized agent");
        if (job.stake > 0) {
            stakeManager.lockReward(msg.sender, job.stake);
        }
        job.agent = msg.sender;
        emit JobApplied(jobId, msg.sender);
    }

    function applyForJob(uint256 jobId)
        external
        requiresTaxAcknowledgement
        whenNotPaused
    {
        _applyForJob(jobId);
    }

    /// @notice Agent submits job result; validation outcome stored.
    function submit(uint256 jobId, string calldata uri)
        external
        requiresTaxAcknowledgement
        whenNotPaused
    {
        Job storage job = jobs[jobId];
        require(job.status == Status.Created, "invalid status");
        require(msg.sender == job.agent, "only agent");
        require(block.timestamp <= job.deadline, "deadline");
        if (address(reputationEngine) != address(0)) {
            require(!reputationEngine.isBlacklisted(msg.sender), "blacklisted agent");
            require(!reputationEngine.isBlacklisted(job.employer), "blacklisted employer");
        }
        job.outputURI = uri;
        emit JobSubmitted(jobId, msg.sender, uri);
        if (address(validationModule) != address(0)) {
            validationModule.selectValidators(jobId);
            bool outcome = validationModule.validate(jobId);
            job.success = outcome;
            job.status = Status.Completed;
            emit JobCompleted(jobId, outcome);
        } else {
            job.success = true;
            job.status = Status.Completed;
            emit JobCompleted(jobId, true);
        }
    }

    /// @notice Employer cancels an open job.
    function cancelJob(uint256 jobId)
        external
        requiresTaxAcknowledgement
        whenNotPaused
    {
        Job storage job = jobs[jobId];
        require(job.status == Status.Created, "invalid status");
        require(job.agent == address(0), "taken");
        require(msg.sender == job.employer, "only employer");
        job.status = Status.Finalized;
        stakeManager.payReward(job.employer, job.reward + job.fee);
        emit JobCancelled(jobId);
    }

    /// @notice Owner delists an open job.
    function delistJob(uint256 jobId) external onlyOwner {
        Job storage job = jobs[jobId];
        require(job.status == Status.Created, "invalid status");
        require(job.agent == address(0), "taken");
        job.status = Status.Finalized;
        stakeManager.payReward(job.employer, job.reward + job.fee);
        emit JobDelisted(jobId);
    }

    /// @notice Agent or employer raises a dispute for a completed job.
    function dispute(uint256 jobId)
        public
        requiresTaxAcknowledgement
        whenNotPaused
    {
        Job storage job = jobs[jobId];
        require(job.status == Status.Completed && !job.success, "cannot dispute");
        require(
            msg.sender == job.agent || msg.sender == job.employer,
            "only participant"
        );
        if (address(reputationEngine) != address(0)) {
            require(!reputationEngine.isBlacklisted(msg.sender), "blacklisted");
        }
        job.status = Status.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute(jobId);
        }
        emit JobDisputed(jobId);
    }

    /// @notice Backwards-compatible wrapper for legacy integrations.
    /// @dev Calls {dispute}.
    function raiseDispute(uint256 jobId) external {
        dispute(jobId);
    }

    /// @notice Resolve a dispute; callable only by the dispute module.
    /// @param jobId Identifier of the disputed job.
    /// @param employerWins True if the employer won the dispute.
    function resolveDispute(uint256 jobId, bool employerWins) external {
        require(msg.sender == address(disputeModule), "only dispute");
        Job storage job = jobs[jobId];
        require(job.status == Status.Disputed, "no dispute");
        job.success = !employerWins;
        job.status = Status.Finalized;
        if (employerWins) {
            stakeManager.payReward(job.employer, job.reward + job.fee);
            stakeManager.slash(
                job.agent,
                IStakeManager.Role.Agent,
                job.stake,
                job.employer
            );
            if (address(reputationEngine) != address(0)) {
                reputationEngine.subtract(job.agent, 1);
            }
        } else {
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
            if (address(reputationEngine) != address(0)) {
                reputationEngine.add(job.agent, 1);
            }
            if (address(certificateNFT) != address(0)) {
                certificateNFT.mint(job.agent, jobId, job.outputURI);
            }
        }
        emit DisputeResolved(jobId, employerWins);
        emit JobFinalized(jobId, job.success);
    }

    /// @notice Finalize a job and trigger payouts and reputation changes.
    function finalize(uint256 jobId)
        external
        requiresTaxAcknowledgement
        whenNotPaused
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
            if (address(reputationEngine) != address(0)) {
                reputationEngine.add(job.agent, 1);
            }
            if (address(certificateNFT) != address(0)) {
                certificateNFT.mint(job.agent, jobId, job.outputURI);
            }
        } else {
            stakeManager.payReward(job.employer, job.reward + job.fee);
            stakeManager.slash(job.agent, IStakeManager.Role.Agent, job.stake, job.employer);
            if (address(reputationEngine) != address(0)) {
                reputationEngine.subtract(job.agent, 1);
            }
        }
        emit JobFinalized(jobId, job.success);
    }

    /// @notice Recover ERC20 tokens sent to this contract by mistake.
    function withdrawEmergency(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}

