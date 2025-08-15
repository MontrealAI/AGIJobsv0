// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {ENSOwnershipVerifier} from "./modules/ENSOwnershipVerifier.sol";

interface IReputationEngine {
    function add(address user, uint256 amount) external;
    function subtract(address user, uint256 amount) external;
    function isBlacklisted(address user) external view returns (bool);
}

interface IDisputeModule {
    function raiseDispute(uint256 jobId, string calldata evidence) external;
    function resolveDispute(uint256 jobId, bool employerWins) external;
}

interface ICertificateNFT {
    function mint(address to, uint256 jobId, string calldata uri) external returns (uint256);
}

/// @title JobRegistry
/// @notice Coordinates job lifecycle and external modules.
/// @dev Tax obligations never accrue to this registry or its owner. All
/// liabilities remain with employers, agents, and validators as expressed by
/// the owner‑controlled `TaxPolicy` reference.
contract JobRegistry is Ownable, ReentrancyGuard {
    enum State {
        None,
        Created,
        Applied,
        Submitted,
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
        uint32 feePct;
        uint64 deadline;
        State state;
        bool success;
        string uri;
    }

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    IValidationModule public validationModule;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IDisputeModule public disputeModule;
    ICertificateNFT public certificateNFT;
    ITaxPolicy public taxPolicy;
    IFeePool public feePool;
    ENSOwnershipVerifier public ensOwnershipVerifier;
    bytes32 public agentRootNode;
    bytes32 public agentMerkleRoot;
    mapping(address => bool) public additionalAgents;

    /// @notice Current version of the tax policy. Participants must acknowledge
    /// this version before interacting. The contract owner remains exempt.
    uint256 public taxPolicyVersion;

    /// @notice Tracks which policy version each participant acknowledged.
    /// @dev Mapping is public for off-chain auditability.
    mapping(address => uint256) public taxAcknowledgedVersion;

    /// @notice Addresses allowed to acknowledge the tax policy for others.
    mapping(address => bool) public acknowledgers;

    /// @dev Reusable gate enforcing acknowledgement of the latest tax policy
    /// version for callers other than the owner or dispute module.
    modifier requiresTaxAcknowledgement() {
        if (msg.sender != owner() && msg.sender != address(disputeModule)) {
            require(
                taxAcknowledgedVersion[msg.sender] == taxPolicyVersion,
                "acknowledge tax policy"
            );
            if (address(taxPolicy) != address(0)) {
                require(
                    taxPolicy.acknowledged(msg.sender),
                    "acknowledge tax policy"
                );
            }
        }
        _;
    }

    // default agent stake requirement configured by owner
    uint96 public jobStake;
    uint96 public constant DEFAULT_JOB_STAKE = 1e6;
    uint256 public feePct;
    uint256 public constant DEFAULT_FEE_PCT = 5;
    uint256 public maxJobReward;
    uint256 public jobDurationLimit;

    // module configuration events
    event ModuleUpdated(string module, address newAddress);
    event ValidationModuleUpdated(address module);
    event StakeManagerUpdated(address manager);
    event ReputationEngineUpdated(address engine);
    event DisputeModuleUpdated(address module);
    event CertificateNFTUpdated(address nft);
    /// @notice Emitted when the tax policy reference or version changes.
    /// @param policy Address of the TaxPolicy contract.
    /// @param version Incrementing version participants must acknowledge.
    event TaxPolicyUpdated(address policy, uint256 version);
    /// @notice Emitted when a participant acknowledges the tax policy, placing
    /// full tax responsibility on the caller while the contract owner remains
    /// exempt. The acknowledgement text is included in the event so explorers
    /// like Etherscan can surface the exact disclaimer the participant
    /// accepted.
    /// @param user Address of the acknowledging participant.
    /// @param version Tax policy version that was acknowledged.
    /// @param acknowledgement Human‑readable disclaimer confirming the caller
    ///        bears all tax liability.
    event TaxAcknowledged(
        address indexed user,
        uint256 version,
        string acknowledgement
    );

    /// @notice Emitted when an acknowledger role is updated.
    /// @param acknowledger Address being granted or revoked the role.
    /// @param allowed True if the address can acknowledge for others.
    event AcknowledgerUpdated(address indexed acknowledger, bool allowed);
    /// @notice Emitted when an additional agent is added or removed.
    /// @param agent Address being updated.
    /// @param allowed True if the agent is whitelisted, false if removed.
    event AdditionalAgentUpdated(address indexed agent, bool allowed);
    /// @notice Emitted when an ENS root node is updated.
    /// @param node Identifier for the root node being modified.
    /// @param newRoot The new ENS root node hash.
    event RootNodeUpdated(string node, bytes32 newRoot);
    /// @notice Emitted when a Merkle root is updated.
    /// @param root Identifier for the Merkle root being modified.
    /// @param newRoot The new Merkle root hash.
    event MerkleRootUpdated(string root, bytes32 newRoot);

    // job parameter template event
    event JobParametersUpdated(uint256 reward, uint256 stake);

    // job lifecycle events
    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake,
        uint256 fee
    );
    event AgentApplied(uint256 indexed jobId, address indexed agent);
    event JobSubmitted(uint256 indexed jobId, string uri);
    event JobCompleted(uint256 indexed jobId, bool success);
    event JobFinalized(uint256 indexed jobId, bool success);
    event JobCancelled(uint256 indexed jobId);
    event JobDisputed(uint256 indexed jobId, address indexed caller);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event FeePoolUpdated(address pool);
    event FeePctUpdated(uint256 feePct);
    event MaxJobRewardUpdated(uint256 maxJobReward);
    event JobDurationLimitUpdated(uint256 limit);

    constructor(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certNFT,
        IFeePool _feePool,
        ITaxPolicy _policy,
        uint256 _feePct,
        uint96 _jobStake,
        address[] memory _ackModules
    ) Ownable(msg.sender) {
        validationModule = _validation;
        stakeManager = _stakeMgr;
        reputationEngine = _reputation;
        disputeModule = _dispute;
        certificateNFT = _certNFT;
        feePool = _feePool;
        uint256 pct = _feePct == 0 ? DEFAULT_FEE_PCT : _feePct;
        require(pct <= 100, "pct");
        feePct = pct;
        jobStake = _jobStake == 0 ? DEFAULT_JOB_STAKE : _jobStake;
        if (address(_validation) != address(0)) {
            emit ValidationModuleUpdated(address(_validation));
            emit ModuleUpdated("ValidationModule", address(_validation));
        }
        if (address(_stakeMgr) != address(0)) {
            emit StakeManagerUpdated(address(_stakeMgr));
            emit ModuleUpdated("StakeManager", address(_stakeMgr));
        }
        if (address(_reputation) != address(0)) {
            emit ReputationEngineUpdated(address(_reputation));
            emit ModuleUpdated("ReputationEngine", address(_reputation));
        }
        if (address(_dispute) != address(0)) {
            emit DisputeModuleUpdated(address(_dispute));
            emit ModuleUpdated("DisputeModule", address(_dispute));
        }
        if (address(_certNFT) != address(0)) {
            emit CertificateNFTUpdated(address(_certNFT));
            emit ModuleUpdated("CertificateNFT", address(_certNFT));
        }
        if (address(_feePool) != address(0)) {
            emit FeePoolUpdated(address(_feePool));
            emit ModuleUpdated("FeePool", address(_feePool));
        }
        emit FeePctUpdated(feePct);
        if (address(_policy) != address(0)) {
            require(_policy.isTaxExempt(), "not tax exempt");
            taxPolicy = _policy;
            taxPolicyVersion++;
            emit TaxPolicyUpdated(address(_policy), taxPolicyVersion);
        }
        for (uint256 i; i < _ackModules.length; i++) {
            acknowledgers[_ackModules[i]] = true;
            emit AcknowledgerUpdated(_ackModules[i], true);
        }
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------
    function setModules(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certNFT,
        address[] calldata _ackModules
    ) external onlyOwner {
        require(address(_validation) != address(0), "validation");
        require(address(_stakeMgr) != address(0), "stake");
        require(address(_reputation) != address(0), "reputation");
        require(address(_dispute) != address(0), "dispute");
        require(address(_certNFT) != address(0), "nft");

        validationModule = _validation;
        stakeManager = _stakeMgr;
        acknowledgers[address(_stakeMgr)] = true;
        emit AcknowledgerUpdated(address(_stakeMgr), true);
        reputationEngine = _reputation;
        disputeModule = _dispute;
        certificateNFT = _certNFT;
        emit ValidationModuleUpdated(address(_validation));
        emit ModuleUpdated("ValidationModule", address(_validation));
        emit StakeManagerUpdated(address(_stakeMgr));
        emit ModuleUpdated("StakeManager", address(_stakeMgr));
        emit ReputationEngineUpdated(address(_reputation));
        emit ModuleUpdated("ReputationEngine", address(_reputation));
        emit DisputeModuleUpdated(address(_dispute));
        emit ModuleUpdated("DisputeModule", address(_dispute));
        emit CertificateNFTUpdated(address(_certNFT));
        emit ModuleUpdated("CertificateNFT", address(_certNFT));
        for (uint256 i; i < _ackModules.length; i++) {
            acknowledgers[_ackModules[i]] = true;
            emit AcknowledgerUpdated(_ackModules[i], true);
        }
    }

    /// @notice Update the ENS ownership verifier contract.
    function setENSOwnershipVerifier(ENSOwnershipVerifier verifier) external onlyOwner {
        ensOwnershipVerifier = verifier;
        emit ModuleUpdated("ENSOwnershipVerifier", address(verifier));
    }

    /// @notice Set the ENS root node used for agent verification.
    function setAgentRootNode(bytes32 node) external onlyOwner {
        agentRootNode = node;
        emit RootNodeUpdated("agent", node);
    }

    /// @notice Set the agent Merkle root used for identity proofs.
    function setAgentMerkleRoot(bytes32 root) external onlyOwner {
        agentMerkleRoot = root;
        ensOwnershipVerifier.setAgentMerkleRoot(root);
        emit MerkleRootUpdated("agent", root);
    }

    /// @notice Configure additional agents that bypass ENS checks.
    function setAdditionalAgents(
        address[] calldata agents,
        bool[] calldata allowed
    ) external onlyOwner {
        require(agents.length == allowed.length, "length");
        for (uint256 i; i < agents.length; ++i) {
            additionalAgents[agents[i]] = allowed[i];
            emit AdditionalAgentUpdated(agents[i], allowed[i]);
        }
    }

    /// @notice Manually allow an agent to bypass ENS checks.
    /// @param agent Address to whitelist.
    function addAdditionalAgent(address agent) external onlyOwner {
        require(agent != address(0), "agent");
        additionalAgents[agent] = true;
        emit AdditionalAgentUpdated(agent, true);
    }

    /// @notice Remove an agent from the manual allowlist.
    /// @param agent Address to remove.
    function removeAdditionalAgent(address agent) external onlyOwner {
        additionalAgents[agent] = false;
        emit AdditionalAgentUpdated(agent, false);
    }

    /// @notice update the FeePool contract used for revenue sharing
    function setFeePool(IFeePool _feePool) external onlyOwner {
        feePool = _feePool;
        emit FeePoolUpdated(address(_feePool));
        emit ModuleUpdated("FeePool", address(_feePool));
    }

    /// @notice update the percentage of each job reward taken as a protocol fee
    function setFeePct(uint256 _feePct) external onlyOwner {
        require(_feePct <= 100, "pct");
        feePct = _feePct;
        emit FeePctUpdated(_feePct);
    }

    /// @notice set the maximum allowed job reward
    function setMaxJobReward(uint256 maxReward) external onlyOwner {
        maxJobReward = maxReward;
        emit MaxJobRewardUpdated(maxReward);
    }

    /// @notice set the maximum allowed job duration in seconds
    function setJobDurationLimit(uint256 limit) external onlyOwner {
        jobDurationLimit = limit;
        emit JobDurationLimitUpdated(limit);
    }

    /// @notice Sets the TaxPolicy contract holding the canonical disclaimer and
    /// bumps the policy version so participants must re-acknowledge.
    /// @dev Only callable by the owner; the policy address cannot be zero and
    /// must explicitly report tax exemption.
    function setTaxPolicy(ITaxPolicy _policy) external onlyOwner {
        require(address(_policy) != address(0), "policy");
        require(_policy.isTaxExempt(), "not tax exempt");
        taxPolicy = _policy;
        taxPolicyVersion++;
        emit TaxPolicyUpdated(address(_policy), taxPolicyVersion);
        emit ModuleUpdated("TaxPolicy", address(_policy));
    }

    /// @notice Increments the tax policy version without changing the contract
    /// address, requiring all participants to re-acknowledge.
    function bumpTaxPolicyVersion() external onlyOwner {
        require(address(taxPolicy) != address(0), "policy");
        taxPolicyVersion++;
        emit TaxPolicyUpdated(address(taxPolicy), taxPolicyVersion);
    }

    /// @notice Confirms this registry and its owner are perpetually tax‑exempt.
    /// @return Always true; no tax liability can accrue here.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @notice Returns the on-chain acknowledgement string stating that all
    /// taxes are the responsibility of employers, agents, and validators.
    function taxAcknowledgement() external view returns (string memory) {
        if (address(taxPolicy) == address(0)) return "";
        return taxPolicy.acknowledgement();
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

    /// @notice Allow or revoke an acknowledger address.
    /// @param acknowledger Address granted permission to acknowledge for users.
    /// @param allowed True to allow the address, false to revoke.
    function setAcknowledger(address acknowledger, bool allowed) external onlyOwner {
        acknowledgers[acknowledger] = allowed;
        emit AcknowledgerUpdated(acknowledger, allowed);
    }

    /// @notice Internal helper to acknowledge the current tax policy for a user.
    function _acknowledge(address user) internal returns (string memory ack) {
        require(address(taxPolicy) != address(0), "policy");
        ack = taxPolicy.acknowledge(user);
        taxAcknowledgedVersion[user] = taxPolicyVersion;
        emit TaxAcknowledged(user, taxPolicyVersion, ack);
    }

    /// @notice Acknowledge the current tax policy.
    /// @dev Retrieves the acknowledgement text from the `TaxPolicy` contract
    /// and emits it for off-chain visibility so participants have an on-chain
    /// record of the exact disclaimer accepted.
    /// @return ack Human‑readable disclaimer confirming the caller bears all
    /// tax responsibility.
    function acknowledgeTaxPolicy() external returns (string memory ack) {
        ack = _acknowledge(msg.sender);
    }

    /// @notice Acknowledge the current tax policy on behalf of a user.
    /// @param user Address whose acknowledgement is recorded.
    /// @return ack Human-readable disclaimer confirming the user bears all tax responsibility.
    function acknowledgeFor(address user) external returns (string memory ack) {
        require(acknowledgers[msg.sender], "acknowledger");
        ack = _acknowledge(user);
    }

    function setJobParameters(uint256 reward, uint256 stake) external onlyOwner {
        require(stake <= type(uint96).max, "overflow");
        jobStake = uint96(stake);
        emit JobParametersUpdated(reward, stake);
    }

    // ---------------------------------------------------------------------
    // Job lifecycle
    // ---------------------------------------------------------------------
    function _createJob(
        uint256 reward,
        uint64 deadline,
        string calldata uri
    ) internal requiresTaxAcknowledgement nonReentrant returns (uint256 jobId) {
        require(reward > 0 || jobStake > 0, "params not set");
        require(reward <= type(uint128).max, "overflow");
        require(reward <= maxJobReward, "reward too high");
        require(deadline > block.timestamp, "deadline");
        require(
            uint256(deadline) - block.timestamp <= jobDurationLimit,
            "duration"
        );
        unchecked {
            nextJobId++;
        }
        jobId = nextJobId;
        uint32 feePctSnapshot = uint32(feePct);
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: uint128(reward),
            stake: jobStake,
            feePct: feePctSnapshot,
            deadline: deadline,
            state: State.Created,
            success: false,
            uri: uri
        });
        uint256 fee;
        if (address(stakeManager) != address(0) && reward > 0) {
            fee = (reward * feePctSnapshot) / 100;
            stakeManager.lockJobFunds(bytes32(jobId), msg.sender, reward + fee);
        }
        emit JobCreated(
            jobId,
            msg.sender,
            address(0),
            reward,
            uint256(jobStake),
            fee
        );
    }

    function createJob(
        uint256 reward,
        uint64 deadline,
        string calldata uri
    ) external returns (uint256 jobId) {
        jobId = _createJob(reward, deadline, uri);
    }

    /**
     * @notice Acknowledge the tax policy and create a job in one transaction.
     * @dev `reward` uses 6-decimal base units. Caller must `approve` the
     *      StakeManager for `reward + fee` $AGIALPHA before calling.
     * @param reward Job reward in $AGIALPHA with 6 decimals.
     * @param uri Metadata URI describing the job.
     * @return jobId Identifier of the newly created job.
     */
    function acknowledgeAndCreateJob(
        uint256 reward,
        uint64 deadline,
        string calldata uri
    ) external returns (uint256 jobId) {
        _acknowledge(msg.sender);
        jobId = _createJob(reward, deadline, uri);
    }

    function _applyForJob(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    ) internal requiresTaxAcknowledgement {
        require(
            ensOwnershipVerifier.verifyOwnership(
                msg.sender,
                subdomain,
                proof,
                agentRootNode
            ) || additionalAgents[msg.sender],
            "Not authorized agent"
        );
        require(!reputationEngine.isBlacklisted(msg.sender), "Blacklisted agent");
        Job storage job = jobs[jobId];
        require(job.state == State.Created, "not open");
        if (job.stake > 0 && address(stakeManager) != address(0)) {
            require(
                stakeManager.stakeOf(msg.sender, IStakeManager.Role.Agent) >=
                    uint256(job.stake),
                "stake missing"
            );
        }
        job.agent = msg.sender;
        job.state = State.Applied;
        emit AgentApplied(jobId, msg.sender);
    }

    function applyForJob(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external {
        _applyForJob(jobId, subdomain, proof);
    }

    /**
     * @notice Acknowledge the current tax policy and apply for a job.
     * @dev No tokens are transferred. Job reward and stake amounts elsewhere
     *      use 6-decimal $AGIALPHA units. Any stake deposits require prior
     *      `approve` calls on the $AGIALPHA token via the `StakeManager`.
     * @param jobId Identifier of the job to apply for.
     */
    function acknowledgeAndApply(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external {
        _acknowledge(msg.sender);
        _applyForJob(jobId, subdomain, proof);
    }

    /**
     * @notice Deposit stake, implicitly acknowledge the tax policy if needed,
     *         and apply for a job in a single call.
     * @dev `amount` uses 6-decimal base units. Caller must `approve` the
     *      `StakeManager` to pull `amount` $AGIALPHA beforehand. If the caller
     *      has not yet acknowledged the tax policy, this helper will do so
     *      automatically on their behalf.
     * @param jobId Identifier of the job to apply for.
     * @param amount Stake amount in $AGIALPHA with 6 decimals.
     */
    function stakeAndApply(
        uint256 jobId,
        uint256 amount,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external {
        if (taxAcknowledgedVersion[msg.sender] != taxPolicyVersion) {
            _acknowledge(msg.sender);
        }
        stakeManager.depositStakeFor(
            msg.sender,
            IStakeManager.Role.Agent,
            amount
        );
        _applyForJob(jobId, subdomain, proof);
    }

    /// @notice Agent submits work for validation and selects validators.
    /// @param jobId Identifier of the job being submitted.
    /// @param uri Metadata URI describing the completed work.
    function submit(uint256 jobId, string calldata uri)
        public
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.state == State.Applied, "invalid state");
        require(msg.sender == job.agent, "only agent");
        job.uri = uri;
        job.state = State.Submitted;
        emit JobSubmitted(jobId, uri);
        if (address(validationModule) != address(0)) {
            validationModule.selectValidators(jobId);
        }
    }

    /// @notice Acknowledge the tax policy and submit work in one call.
    function acknowledgeAndSubmit(uint256 jobId, string calldata uri) external {
        _acknowledge(msg.sender);
        submit(jobId, uri);
    }

    /// @notice Finalize job outcome after validation.
    /// @param jobId Identifier of the job to finalize post-validation.
    function finalizeAfterValidation(uint256 jobId)
        public
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.state == State.Submitted, "not submitted");
        bool outcome = validationModule.tally(jobId);
        job.success = outcome;
        job.state = outcome ? State.Completed : State.Disputed;
        emit JobCompleted(jobId, outcome);
    }

    /// @notice Agent disputes a failed job outcome with supporting evidence.
    /// @param jobId Identifier of the disputed job.
    /// @param evidence Supporting evidence for the dispute.
    function raiseDispute(uint256 jobId, string calldata evidence)
        public
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.state == State.Disputed && !job.success, "cannot dispute");
        require(msg.sender == job.agent, "only agent");
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute(jobId, evidence);
        }
        emit JobDisputed(jobId, msg.sender);
    }

    /**
     * @notice Acknowledge the tax policy if needed and raise a dispute with
     *         supporting evidence.
     * @dev No tokens are transferred; any stake requirements elsewhere use
     *      6-decimal $AGIALPHA units that must have been approved previously.
     * @param jobId Identifier of the disputed job.
     * @param evidence Supporting evidence for the dispute.
     */
    function acknowledgeAndDispute(uint256 jobId, string calldata evidence) external {
        if (taxAcknowledgedVersion[msg.sender] != taxPolicyVersion) {
            _acknowledge(msg.sender);
        }
        raiseDispute(jobId, evidence);
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
    /// @dev The dispute module may call this without acknowledgement as it
    ///      merely relays the arbiter's ruling and holds no tax liability.
    function finalize(uint256 jobId)
        public
        requiresTaxAcknowledgement
        nonReentrant
    {
        Job storage job = jobs[jobId];
        require(job.state == State.Completed, "not ready");
        job.state = State.Finalized;
        bytes32 jobKey = bytes32(jobId);
        if (job.success) {
            IFeePool pool = feePool;
            if (address(stakeManager) != address(0)) {
                uint256 fee;
                if (address(pool) != address(0) && job.reward > 0) {
                    fee = (uint256(job.reward) * job.feePct) / 100;
                }
                stakeManager.finalizeJobFunds(
                    jobKey,
                    job.agent,
                    uint256(job.reward),
                    fee,
                    pool
                );
            }
            if (address(reputationEngine) != address(0)) {
                reputationEngine.add(job.agent, 1);
            }
            if (address(certificateNFT) != address(0)) {
                certificateNFT.mint(job.agent, jobId, job.uri);
            }
        } else {
            if (address(stakeManager) != address(0)) {
                uint256 fee = (uint256(job.reward) * job.feePct) / 100;
                if (job.reward > 0) {
                    stakeManager.releaseJobFunds(
                        jobKey,
                        job.employer,
                        uint256(job.reward) + fee
                    );
                }
                if (job.stake > 0) {
                    stakeManager.slash(
                        job.agent,
                        IStakeManager.Role.Agent,
                        uint256(job.stake),
                        job.employer
                    );
                }
            }
            if (address(reputationEngine) != address(0)) {
                reputationEngine.subtract(job.agent, 1);
            }
        }
        emit JobFinalized(jobId, job.success);
    }

    /// @notice Acknowledge the tax policy and finalise the job in one call.
    /// @param jobId Identifier of the job to finalise
    function acknowledgeAndFinalize(uint256 jobId) external {
        _acknowledge(msg.sender);
        finalize(jobId);
    }

    /// @notice Acknowledge the tax policy and cancel a job in one call.
    /// @param jobId Identifier of the job to cancel
    function acknowledgeAndCancel(uint256 jobId) external {
        _acknowledge(msg.sender);
        cancelJob(jobId);
    }

    /// @notice Cancel a job before completion and refund the employer.
    function cancelJob(uint256 jobId)
        public
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(
            job.state == State.Created || job.state == State.Applied,
            "cannot cancel"
        );
        require(msg.sender == job.employer, "only employer");
        job.state = State.Cancelled;
        if (address(stakeManager) != address(0) && job.reward > 0) {
            uint256 fee = (uint256(job.reward) * job.feePct) / 100;
            stakeManager.releaseJobFunds(
                bytes32(jobId),
                job.employer,
                uint256(job.reward) + fee
            );
        }
        emit JobCancelled(jobId);
    }

    /// @notice Owner can delist an unassigned job and refund the employer.
    /// @param jobId Identifier of the job to cancel.
    function delistJob(uint256 jobId) external onlyOwner {
        Job storage job = jobs[jobId];
        require(job.state == State.Created && job.agent == address(0), "cannot delist");
        job.state = State.Cancelled;
        if (address(stakeManager) != address(0) && job.reward > 0) {
            uint256 fee = (uint256(job.reward) * job.feePct) / 100;
            stakeManager.releaseJobFunds(
                bytes32(jobId),
                job.employer,
                uint256(job.reward) + fee
            );
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


