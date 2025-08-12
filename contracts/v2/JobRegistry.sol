// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";

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
contract JobRegistry is Ownable, ReentrancyGuard {
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
        uint32 feePct;
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

    /// @notice Current version of the tax policy. Participants must acknowledge
    /// this version before interacting. The contract owner remains exempt.
    uint256 public taxPolicyVersion;

    /// @notice Tracks which policy version each participant acknowledged.
    /// @dev Mapping is public for off-chain auditability.
    mapping(address => uint256) public taxAcknowledgedVersion;

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
    uint256 public feePct;
    uint256 public constant DEFAULT_FEE_PCT = 5;

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
    event JobCompleted(uint256 indexed jobId, bool success);
    event JobFinalized(uint256 indexed jobId, bool success);
    event JobCancelled(uint256 indexed jobId);
    event JobDisputed(uint256 indexed jobId, address indexed caller);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event FeePoolUpdated(address pool);
    event FeePctUpdated(uint256 feePct);

    constructor(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certNFT,
        IFeePool _feePool
    ) Ownable(msg.sender) {
        validationModule = _validation;
        stakeManager = _stakeMgr;
        reputationEngine = _reputation;
        disputeModule = _dispute;
        certificateNFT = _certNFT;
        feePool = _feePool;
        feePct = DEFAULT_FEE_PCT;
        jobStake = 0;
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
        emit ModuleUpdated("ValidationModule", address(_validation));
        emit StakeManagerUpdated(address(_stakeMgr));
        emit ModuleUpdated("StakeManager", address(_stakeMgr));
        emit ReputationEngineUpdated(address(_reputation));
        emit ModuleUpdated("ReputationEngine", address(_reputation));
        emit DisputeModuleUpdated(address(_dispute));
        emit ModuleUpdated("DisputeModule", address(_dispute));
        emit CertificateNFTUpdated(address(_certNFT));
        emit ModuleUpdated("CertificateNFT", address(_certNFT));
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

    function setJobParameters(uint256 reward, uint256 stake) external onlyOwner {
        require(stake <= type(uint96).max, "overflow");
        jobStake = uint96(stake);
        emit JobParametersUpdated(reward, stake);
    }

    // ---------------------------------------------------------------------
    // Job lifecycle
    // ---------------------------------------------------------------------
    function _createJob(uint256 reward, string calldata uri)
        internal
        requiresTaxAcknowledgement
        nonReentrant
        returns (uint256 jobId)
    {
        require(reward > 0 || jobStake > 0, "params not set");
        require(reward <= type(uint128).max, "overflow");
        unchecked { nextJobId++; }
        jobId = nextJobId;
        uint32 feePctSnapshot = uint32(feePct);
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: uint128(reward),
            stake: jobStake,
            feePct: feePctSnapshot,
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

    function createJob(uint256 reward, string calldata uri)
        external
        returns (uint256 jobId)
    {
        jobId = _createJob(reward, uri);
    }

    function acknowledgeAndCreateJob(uint256 reward, string calldata uri)
        external
        returns (uint256 jobId)
    {
        _acknowledge(msg.sender);
        jobId = _createJob(reward, uri);
    }

    function _applyForJob(uint256 jobId) internal requiresTaxAcknowledgement {
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

    function applyForJob(uint256 jobId) external {
        _applyForJob(jobId);
    }

    function stakeAndApply(uint256 jobId, uint256 amount) external {
        if (taxAcknowledgedVersion[msg.sender] != taxPolicyVersion) {
            _acknowledge(msg.sender);
        }
        stakeManager.depositStakeFor(
            msg.sender,
            IStakeManager.Role.Agent,
            amount
        );
        _applyForJob(jobId);
    }

    /// @notice Agent completes the job; validation outcome stored.
    function completeJob(uint256 jobId)
        public
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.state == State.Applied, "invalid state");
        require(msg.sender == job.agent, "only agent");
        bool outcome = validationModule.tally(jobId);
        job.success = outcome;
        job.state = State.Completed;
        emit JobCompleted(jobId, outcome);
    }

    /// @notice Agent disputes a failed job outcome.
    function raiseDispute(uint256 jobId)
        public
        payable
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.state == State.Completed && !job.success, "cannot dispute");
        require(msg.sender == job.agent, "only agent");
        job.state = State.Disputed;
        if (address(disputeModule) != address(0)) {
            disputeModule.appeal{value: msg.value}(jobId);
        } else {
            require(msg.value == 0, "fee unused");
        }
        emit JobDisputed(jobId, msg.sender);
    }

    function dispute(uint256 jobId)
        external
        payable
        requiresTaxAcknowledgement
    {
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
    /// @dev The dispute module may call this without acknowledgement as it
    ///      merely relays the arbiter's ruling and holds no tax liability.
    function finalize(uint256 jobId)
        external
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

    /// @notice Cancel a job before completion and refund the employer.
    function cancelJob(uint256 jobId)
        external
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


