// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {TaxAcknowledgement} from "./libraries/TaxAcknowledgement.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";

interface IReputationEngine {
    function version() external view returns (uint256);
    function onApply(address user) external;
    function onFinalize(
        address user,
        bool success,
        uint256 payout,
        uint256 duration
    ) external;
    function rewardValidator(address validator, uint256 agentGain) external;
    function calculateReputationPoints(
        uint256 payout,
        uint256 duration
    ) external view returns (uint256);
    function isBlacklisted(address user) external view returns (bool);
}

interface IDisputeModule {
    function version() external view returns (uint256);
    function raiseDispute(
        uint256 jobId,
        address claimant,
        bytes32 evidenceHash
    ) external;
    function resolve(uint256 jobId, bool employerWins) external;
}

interface ICertificateNFT {
    function version() external view returns (uint256);
    function mint(address to, uint256 jobId, bytes32 uriHash) external returns (uint256);
}

/// @title JobRegistry
/// @notice Coordinates job lifecycle and external modules.
/// @dev Tax obligations never accrue to this registry or its owner. All
/// liabilities remain with employers, agents, and validators as expressed by
/// the owner‑controlled `TaxPolicy` reference.
contract JobRegistry is Governable, ReentrancyGuard, TaxAcknowledgement, Pausable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 1;

    error JobParametersUnset();
    error RewardOverflow();
    error RewardTooHigh();
    error InvalidDeadline();
    error InvalidAgentTypes();
    error DurationTooLong();
    error InvalidPercentages();
    error BlacklistedEmployer();

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
        State state;
        bool success;
        uint8 agentTypes;
        uint64 deadline;
        uint64 assignedAt;
        bytes32 uriHash;
        bytes32 resultHash;
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
    IIdentityRegistry public identityRegistry;
    address public treasury;


    /// @notice Addresses allowed to acknowledge the tax policy for others.
    mapping(address => bool) public acknowledgers;

    // cache successful agent authorizations
    mapping(address => bool) public agentAuthCache;
    mapping(address => uint256) public agentAuthExpiry;
    mapping(address => uint256) public agentAuthVersion;
    uint256 public agentAuthCacheVersion;
    uint256 public agentAuthCacheDuration = 1 days;

    /// @dev Reusable gate enforcing acknowledgement of the latest tax policy
    /// version for callers other than the owner, dispute module, or validation module.

    modifier onlyAfterDeadline(uint256 jobId) {
        Job storage job = jobs[jobId];
        require(job.state == State.Applied, "cannot expire");
        require(
            block.timestamp > uint256(job.deadline) + expirationGracePeriod,
            "not expired"
        );
        _;
    }

    // default agent stake requirement configured by owner
    uint96 public jobStake;
    uint96 public constant DEFAULT_JOB_STAKE = 1e18;
    uint256 public feePct;
    uint256 public constant DEFAULT_FEE_PCT = 5;
    uint256 public maxJobReward;
    uint256 public maxJobDuration;
    uint256 public validatorRewardPct;
    uint256 public constant DEFAULT_VALIDATOR_REWARD_PCT = 8;
    uint256 public expirationGracePeriod;

    // module configuration events
    event ModuleUpdated(string module, address newAddress);
    event ValidationModuleUpdated(address module);
    event StakeManagerUpdated(address manager);
    event ReputationEngineUpdated(address engine);
    event DisputeModuleUpdated(address module);
    event CertificateNFTUpdated(address nft);
    event IdentityRegistryUpdated(address identityRegistry);
    event ValidatorRewardPctUpdated(uint256 pct);
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

    event AgentRootNodeUpdated(bytes32 node);
    event AgentMerkleRootUpdated(bytes32 root);
    event AgentAuthCacheUpdated(address indexed agent, bool authorized);
    event AgentAuthCacheDurationUpdated(uint256 duration);

    // job parameter template event
    event JobParametersUpdated(
        uint256 reward,
        uint256 stake,
        uint256 maxJobReward,
        uint256 maxJobDuration
    );

    // job lifecycle events
    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake,
        uint256 fee,
        string uri
    );
    event JobApplied(uint256 indexed jobId, address indexed agent);
    event JobSubmitted(
        uint256 indexed jobId,
        address indexed worker,
        bytes32 resultHash,
        string resultURI
    );
    event JobCompleted(uint256 indexed jobId, bool success);
    /// @notice Emitted when a job is finalized
    /// @param jobId Identifier of the job
    /// @param worker Agent who performed the job
    event JobFinalized(uint256 indexed jobId, address worker);
    event JobCancelled(uint256 indexed jobId);
    /// @notice Emitted when an assigned job is cancelled after missing its deadline
    /// @param jobId Identifier of the expired job
    /// @param caller Address that triggered the expiration
    event JobExpired(uint256 indexed jobId, address indexed caller);
    event JobDisputed(uint256 indexed jobId, address indexed caller);
    event DisputeResolved(uint256 indexed jobId, bool employerWins);
    event FeePoolUpdated(address pool);
    event FeePctUpdated(uint256 feePct);
    event ExpirationGracePeriodUpdated(uint256 period);
    event GovernanceFinalized(
        uint256 indexed jobId,
        address indexed caller,
        bool fundsRedirected
    );
    event TreasuryUpdated(address treasury);

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
        address[] memory _ackModules,
        address _timelock // timelock or multisig controller
    ) Governable(_timelock) {
        uint256 pct = _feePct == 0 ? DEFAULT_FEE_PCT : _feePct;
        require(pct <= 100, "pct");
        feePct = pct;
        jobStake = _jobStake == 0 ? DEFAULT_JOB_STAKE : _jobStake;
        validatorRewardPct = DEFAULT_VALIDATOR_REWARD_PCT;
        emit ValidatorRewardPctUpdated(validatorRewardPct);
        if (address(_validation) != address(0)) {
            require(_validation.version() == 1, "Invalid validation module");
            validationModule = _validation;
            emit ValidationModuleUpdated(address(_validation));
            emit ModuleUpdated("ValidationModule", address(_validation));
        }
        if (address(_stakeMgr) != address(0)) {
            require(_stakeMgr.version() == 1, "Invalid stake manager");
            stakeManager = _stakeMgr;
            emit StakeManagerUpdated(address(_stakeMgr));
            emit ModuleUpdated("StakeManager", address(_stakeMgr));
        }
        if (address(_reputation) != address(0)) {
            require(_reputation.version() == 1, "Invalid reputation module");
            reputationEngine = _reputation;
            emit ReputationEngineUpdated(address(_reputation));
            emit ModuleUpdated("ReputationEngine", address(_reputation));
        }
        if (address(_dispute) != address(0)) {
            require(_dispute.version() == 1, "Invalid dispute module");
            disputeModule = _dispute;
            emit DisputeModuleUpdated(address(_dispute));
            emit ModuleUpdated("DisputeModule", address(_dispute));
        }
        if (address(_certNFT) != address(0)) {
            require(_certNFT.version() == 1, "Invalid certificate NFT");
            certificateNFT = _certNFT;
            emit CertificateNFTUpdated(address(_certNFT));
            emit ModuleUpdated("CertificateNFT", address(_certNFT));
        }
        if (address(_feePool) != address(0)) {
            feePool = _feePool;
            emit FeePoolUpdated(address(_feePool));
            emit ModuleUpdated("FeePool", address(_feePool));
        }
        emit FeePctUpdated(feePct);
        if (address(_policy) != address(0)) {
            require(_policy.isTaxExempt(), "not tax exempt");
            taxPolicy = _policy;
            emit TaxPolicyUpdated(address(_policy), _policy.policyVersion());
        }
        for (uint256 i; i < _ackModules.length;) {
            acknowledgers[_ackModules[i]] = true;
            emit AcknowledgerUpdated(_ackModules[i], true);
            unchecked {
                ++i;
            }
        }
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------
    // Setters below are executed manually via Etherscan's "Write Contract"
    // tab using the authorized owner account.
    function setModules(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certNFT,
        IFeePool _feePool,
        address[] calldata _ackModules
    ) external onlyGovernance {
        require(address(_validation) != address(0), "validation");
        require(address(_stakeMgr) != address(0), "stake");
        require(address(_reputation) != address(0), "reputation");
        require(address(_dispute) != address(0), "dispute");
        require(address(_certNFT) != address(0), "nft");

        require(_validation.version() == 1, "Invalid validation module");
        require(_stakeMgr.version() == 1, "Invalid stake manager");
        require(_reputation.version() == 1, "Invalid reputation module");
        require(_dispute.version() == 1, "Invalid dispute module");
        require(_certNFT.version() == 1, "Invalid certificate NFT");

        validationModule = _validation;
        stakeManager = _stakeMgr;
        acknowledgers[address(_stakeMgr)] = true;
        emit AcknowledgerUpdated(address(_stakeMgr), true);
        reputationEngine = _reputation;
        disputeModule = _dispute;
        certificateNFT = _certNFT;
        feePool = _feePool;
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
        emit FeePoolUpdated(address(_feePool));
        emit ModuleUpdated("FeePool", address(_feePool));
        for (uint256 i; i < _ackModules.length;) {
            acknowledgers[_ackModules[i]] = true;
            emit AcknowledgerUpdated(_ackModules[i], true);
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Update the identity registry used for agent verification.
    /// @param registry Address of the IdentityRegistry contract.
    function setIdentityRegistry(IIdentityRegistry registry) external onlyGovernance {
        identityRegistry = registry;
        emit IdentityRegistryUpdated(address(registry));
        emit ModuleUpdated("IdentityRegistry", address(registry));
    }

    /// @notice Switch the active dispute module.
    /// @param module Address of the new dispute module contract.
    function setDisputeModule(IDisputeModule module) external onlyGovernance {
        require(address(module) != address(0), "dispute");
        require(module.version() == 1, "Invalid dispute module");
        disputeModule = module;
        emit DisputeModuleUpdated(address(module));
        emit ModuleUpdated("DisputeModule", address(module));
    }

    /// @notice Update the ENS root node used for agent verification.
    /// @param node Namehash of the agent parent node (e.g. `agent.agi.eth`).
    function setAgentRootNode(bytes32 node) external onlyGovernance {
        require(address(identityRegistry) != address(0), "identity reg");
        identityRegistry.setAgentRootNode(node);
        emit AgentRootNodeUpdated(node);
    }

    /// @notice Update the Merkle root for the agent allowlist.
    /// @param root Merkle root of approved agent addresses.
    function setAgentMerkleRoot(bytes32 root) external onlyGovernance {
        require(address(identityRegistry) != address(0), "identity reg");
        identityRegistry.setAgentMerkleRoot(root);
        unchecked {
            agentAuthCacheVersion++;
        }
        emit AgentMerkleRootUpdated(root);
    }

    /// @notice Refresh or invalidate cached agent authorization entries.
    /// @param agent Address of the agent being updated.
    /// @param authorized True to refresh the cache entry, false to invalidate it.
    function updateAgentAuthCache(address agent, bool authorized)
        external
        onlyGovernance
    {
        agentAuthCache[agent] = authorized;
        agentAuthExpiry[agent] =
            authorized ? block.timestamp + agentAuthCacheDuration : 0;
        agentAuthVersion[agent] = authorized ? agentAuthCacheVersion : 0;
        emit AgentAuthCacheUpdated(agent, authorized);
    }

    /// @notice Update the duration for cached agent authorizations.
    /// @param duration Seconds an authorization remains valid in cache.
    function setAgentAuthCacheDuration(uint256 duration) external onlyGovernance {
        agentAuthCacheDuration = duration;
        emit AgentAuthCacheDurationUpdated(duration);
    }

    /// @notice update the FeePool contract used for revenue sharing
    function setFeePool(IFeePool _feePool) external onlyGovernance {
        feePool = _feePool;
        emit FeePoolUpdated(address(_feePool));
        emit ModuleUpdated("FeePool", address(_feePool));
    }

    /// @notice update the treasury address used for blacklisted payouts
    function setTreasury(address _treasury) external onlyGovernance {
        require(_treasury != address(0), "treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice update the required agent stake for each job
    function setJobStake(uint96 stake) external onlyGovernance {
        jobStake = stake;
        emit JobParametersUpdated(0, stake, maxJobReward, maxJobDuration);
    }

    /// @notice update the percentage of each job reward taken as a protocol fee
    function setFeePct(uint256 _feePct) external onlyGovernance {
        require(_feePct <= 100, "pct");
        require(_feePct + validatorRewardPct <= 100, "pct");
        feePct = _feePct;
        emit FeePctUpdated(_feePct);
    }

    /// @notice update validator reward percentage of job reward
    function setValidatorRewardPct(uint256 pct) external onlyGovernance {
        require(pct <= 100, "pct");
        require(feePct + pct <= 100, "pct");
        validatorRewardPct = pct;
        emit ValidatorRewardPctUpdated(pct);
    }

    /// @notice set the maximum allowed job reward
    function setMaxJobReward(uint256 maxReward) external onlyGovernance {
        maxJobReward = maxReward;
        emit JobParametersUpdated(0, jobStake, maxReward, maxJobDuration);
    }

    /// @notice set the maximum allowed job duration in seconds
    function setJobDurationLimit(uint256 limit) external onlyGovernance {
        maxJobDuration = limit;
        emit JobParametersUpdated(0, jobStake, maxJobReward, limit);
    }

    /// @notice set additional grace period after a job's deadline before it can expire
    function setExpirationGracePeriod(uint256 period) external onlyGovernance {
        expirationGracePeriod = period;
        emit ExpirationGracePeriodUpdated(period);
    }

    /// @notice Sets the TaxPolicy contract holding the canonical disclaimer.
    /// @dev Only callable by the owner; the policy address cannot be zero and
    /// must explicitly report tax exemption.
    function setTaxPolicy(ITaxPolicy _policy) external onlyGovernance {
        require(address(_policy) != address(0), "policy");
        require(_policy.isTaxExempt(), "not tax exempt");
        taxPolicy = _policy;
        emit TaxPolicyUpdated(address(_policy), _policy.policyVersion());
        emit ModuleUpdated("TaxPolicy", address(_policy));
    }

    /// @notice Pause job lifecycle interactions
    function pause() external onlyGovernance {
        _pause();
    }

    /// @notice Resume job lifecycle interactions
    function unpause() external onlyGovernance {
        _unpause();
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
    function setAcknowledger(address acknowledger, bool allowed) external onlyGovernance {
        acknowledgers[acknowledger] = allowed;
        emit AcknowledgerUpdated(acknowledger, allowed);
    }

    /// @notice Internal helper to acknowledge the current tax policy for a user.
    function _acknowledge(address user) internal returns (string memory ack) {
        require(address(taxPolicy) != address(0), "policy");
        ack = taxPolicy.acknowledge(user);
        emit TaxAcknowledged(user, taxPolicy.policyVersion(), ack);
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

    function setJobParameters(uint256 reward, uint256 stake) external onlyGovernance {
        require(stake <= type(uint96).max, "overflow");
        jobStake = uint96(stake);
        emit JobParametersUpdated(reward, stake, maxJobReward, maxJobDuration);
    }

    // ---------------------------------------------------------------------
    // Job lifecycle
    // ---------------------------------------------------------------------
    function _createJob(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        string calldata uri
    )
        internal
        whenNotPaused
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
        nonReentrant
        returns (uint256 jobId)
    {
        if (reward == 0 && jobStake == 0) revert JobParametersUnset();
        if (reward > type(uint128).max) revert RewardOverflow();
        if (maxJobReward != 0 && reward > maxJobReward) revert RewardTooHigh();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (agentTypes == 0 || agentTypes > 3) revert InvalidAgentTypes();
        if (
            maxJobDuration > 0 &&
            uint256(deadline) - block.timestamp > maxJobDuration
        ) revert DurationTooLong();
        if (feePct + validatorRewardPct > 100) revert InvalidPercentages();
        if (
            address(reputationEngine) != address(0) &&
            reputationEngine.isBlacklisted(msg.sender)
        ) {
            revert BlacklistedEmployer();
        }
        unchecked {
            nextJobId++;
        }
        jobId = nextJobId;
        uint32 feePctSnapshot = uint32(feePct);
        bytes32 uriHash = keccak256(bytes(uri));
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: uint128(reward),
            stake: jobStake,
            feePct: feePctSnapshot,
            deadline: deadline,
            assignedAt: 0,
            state: State.Created,
            success: false,
            uriHash: uriHash,
            resultHash: bytes32(0),
            agentTypes: agentTypes
        });
        uint256 fee;
        if (address(stakeManager) != address(0) && reward > 0) {
            fee = (reward * feePctSnapshot) / 100;
            stakeManager.lockReward(bytes32(jobId), msg.sender, reward + fee);
        }
        emit JobCreated(
            jobId,
            msg.sender,
            address(0),
            reward,
            uint256(jobStake),
            fee,
            uri
        );
    }

    function createJob(
        uint256 reward,
        uint64 deadline,
        string calldata uri
    ) external returns (uint256 jobId) {
        jobId = _createJob(reward, deadline, 3, uri);
    }

    function createJobWithAgentTypes(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        string calldata uri
    ) external returns (uint256 jobId) {
        jobId = _createJob(reward, deadline, agentTypes, uri);
    }

    /**
     * @notice Acknowledge the tax policy and create a job in one transaction.
     * @dev `reward` uses 18-decimal base units. Caller must `approve` the
     *      StakeManager for `reward + fee` $AGIALPHA before calling.
     * @param reward Job reward in $AGIALPHA with 18 decimals.
     * @param uri Metadata URI describing the job.
     * @return jobId Identifier of the newly created job.
     */
    function acknowledgeAndCreateJob(
        uint256 reward,
        uint64 deadline,
        string calldata uri
    ) external returns (uint256 jobId) {
        _acknowledge(msg.sender);
        jobId = _createJob(reward, deadline, 3, uri);
    }

    function acknowledgeAndCreateJobWithAgentTypes(
        uint256 reward,
        uint64 deadline,
        uint8 agentTypes,
        string calldata uri
    ) external returns (uint256 jobId) {
        _acknowledge(msg.sender);
        jobId = _createJob(reward, deadline, agentTypes, uri);
    }

    function _applyForJob(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        internal
        whenNotPaused
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        Job storage job = jobs[jobId];
        require(job.state == State.Created, "not open");
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "Blacklisted agent"
            );
        }
        require(address(identityRegistry) != address(0), "identity reg");
        bool authorized =
            agentAuthCache[msg.sender] &&
            agentAuthExpiry[msg.sender] > block.timestamp &&
            agentAuthVersion[msg.sender] == agentAuthCacheVersion;
        if (!authorized) {
            authorized = identityRegistry.verifyAgent(
                msg.sender,
                subdomain,
                proof
            );
            if (authorized) {
                agentAuthCache[msg.sender] = true;
                agentAuthExpiry[msg.sender] =
                    block.timestamp + agentAuthCacheDuration;
                agentAuthVersion[msg.sender] = agentAuthCacheVersion;
            }
        }
        require(authorized, "Not authorized agent");
        if (job.agentTypes > 0) {
            IIdentityRegistry.AgentType aType = identityRegistry.getAgentType(
                msg.sender
            );
            require(
                (job.agentTypes & (1 << uint8(aType))) != 0,
                "Agent type not allowed"
            );
        }
        if (address(reputationEngine) != address(0)) {
            reputationEngine.onApply(msg.sender);
        }
        if (job.stake > 0 && address(stakeManager) != address(0)) {
            uint64 lockTime;
            if (job.deadline > block.timestamp) {
                lockTime = uint64(job.deadline - block.timestamp);
            }
            stakeManager.lockStake(msg.sender, uint256(job.stake), lockTime);
        }
        job.agent = msg.sender;
        job.state = State.Applied;
        job.assignedAt = uint64(block.timestamp);
        emit JobApplied(jobId, msg.sender);
    }

    function applyForJob(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external nonReentrant {
        _applyForJob(jobId, subdomain, proof);
    }


    /**
     * @notice Acknowledge the current tax policy and apply for a job.
     * @dev No tokens are transferred. Job reward and stake amounts elsewhere
     *      use 18-decimal $AGIALPHA units. Any stake deposits require prior
     *      `approve` calls on the $AGIALPHA token via the `StakeManager`.
     * @param jobId Identifier of the job to apply for.
     */
    function acknowledgeAndApply(
        uint256 jobId,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external nonReentrant {
        _acknowledge(msg.sender);
        _applyForJob(jobId, subdomain, proof);
    }

    /**
     * @notice Deposit stake, implicitly acknowledge the tax policy if needed,
     *         and apply for a job in a single call.
     * @dev `amount` uses 18-decimal base units. Caller must `approve` the
     *      `StakeManager` to pull `amount` $AGIALPHA beforehand. If the caller
     *      has not yet acknowledged the tax policy, this helper will do so
     *      automatically on their behalf.
     * @param jobId Identifier of the job to apply for.
     * @param amount Stake amount in $AGIALPHA with 18 decimals.
    */
    function stakeAndApply(
        uint256 jobId,
        uint256 amount,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external nonReentrant {
        _acknowledge(msg.sender);
        stakeManager.depositStakeFor(
            msg.sender,
            IStakeManager.Role.Agent,
            amount
        );
        _applyForJob(jobId, subdomain, proof);
    }

    /// @notice Agent submits work for validation and selects validators.
    /// @param jobId Identifier of the job being submitted.
    /// @param resultHash Hash of the completed work.
    /// @param resultURI Metadata URI describing the completed work.
    function submit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata subdomain,
        bytes32[] calldata proof
    )
        public
        whenNotPaused
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        Job storage job = jobs[jobId];
        require(job.state == State.Applied, "invalid state");
        require(msg.sender == job.agent, "only agent");
        require(block.timestamp <= job.deadline, "deadline");
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "Blacklisted agent"
            );
            require(
                !reputationEngine.isBlacklisted(job.employer),
                "Blacklisted employer"
            );
        }
        require(address(identityRegistry) != address(0), "identity reg");
        bool authorized = identityRegistry.verifyAgent(
            msg.sender,
            subdomain,
            proof
        );
        require(authorized, "Not authorized agent");
        if (job.agentTypes > 0) {
            IIdentityRegistry.AgentType aType = identityRegistry.getAgentType(
                msg.sender
            );
            require(
                (job.agentTypes & (1 << uint8(aType))) != 0,
                "Agent type not allowed"
            );
        }
        job.resultHash = resultHash;
        job.state = State.Submitted;
        emit JobSubmitted(jobId, msg.sender, resultHash, resultURI);
        if (address(validationModule) != address(0)) {
            validationModule.start(
                jobId,
                uint256(
                    keccak256(
                        abi.encodePacked(
                            jobId,
                            msg.sender,
                            resultHash,
                            block.timestamp,
                            block.prevrandao,
                            blockhash(block.number - 1)
                        )
                    )
                )
            );
        }
    }

    /// @notice Acknowledge the tax policy and submit work in one call.
    function acknowledgeAndSubmit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external {
        _acknowledge(msg.sender);
        submit(jobId, resultHash, resultURI, subdomain, proof);
    }

    /// @notice Finalize job outcome after validation.
    /// @dev Only the ValidationModule may call this entry point with the
    ///      computed result of the commit-reveal process.
    /// @param jobId Identifier of the job being finalised.
    /// @param success True if validators approved the job.
    function finalizeAfterValidation(uint256 jobId, bool success)
        public
        whenNotPaused
        nonReentrant
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        require(msg.sender == address(validationModule), "only validation");
        Job storage job = jobs[jobId];
        require(job.state == State.Submitted, "not submitted");
        job.success = success;
        job.state = success ? State.Completed : State.Disputed;
        emit JobCompleted(jobId, success);
        if (success) {
            _finalize(jobId);
        }
    }

    function validationComplete(uint256 jobId, bool success) external whenNotPaused {
        finalizeAfterValidation(jobId, success);
    }

    /// @notice Receive validation outcome from the ValidationModule
    /// @param jobId Identifier of the job
    /// @param success True if validators approved the job
    /// @param validators Validators that participated in validation
    function onValidationResult(
        uint256 jobId,
        bool success,
        address[] calldata validators
    ) external {
        validators; // silence unused variable warning
        finalizeAfterValidation(jobId, success);
    }

    /// @notice Agent or employer disputes a job outcome with a hash of off-chain evidence.
    /// @param jobId Identifier of the disputed job.
    /// @param evidenceHash Keccak256 hash of the evidence stored off-chain.
    function dispute(uint256 jobId, bytes32 evidenceHash)
        public
        whenNotPaused
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        require(evidenceHash != bytes32(0), "evidence");
        Job storage job = jobs[jobId];
        require(
            msg.sender == job.agent || msg.sender == job.employer,
            "only participant"
        );
        require(
            job.state == State.Completed ||
                (job.state == State.Disputed && !job.success),
            "cannot dispute"
        );
        if (job.state == State.Completed) {
            job.state = State.Disputed;
        }
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "Blacklisted"
            );
            require(
                !reputationEngine.isBlacklisted(job.agent),
                "Blacklisted agent"
            );
            require(
                !reputationEngine.isBlacklisted(job.employer),
                "Blacklisted employer"
            );
        }
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute(jobId, msg.sender, evidenceHash);
        }
        emit JobDisputed(jobId, msg.sender);
    }

    /// @notice Backwards-compatible wrapper for legacy integrations.
    /// @dev Calls {dispute} with the provided evidence hash.
    function raiseDispute(uint256 jobId, bytes32 evidenceHash) public {
        dispute(jobId, evidenceHash);
    }

    /**
     * @notice Acknowledge the tax policy if needed and raise a dispute with
     *         supporting evidence stored off-chain.
     * @dev No tokens are transferred; any stake requirements elsewhere use
     *      18-decimal $AGIALPHA units that must have been approved previously.
     * @param jobId Identifier of the disputed job.
     * @param evidenceHash Keccak256 hash of the off-chain evidence.
     */
    function acknowledgeAndDispute(uint256 jobId, bytes32 evidenceHash) external {
        if (
            address(taxPolicy) != address(0) &&
            !taxPolicy.hasAcknowledged(msg.sender)
        ) {
            _acknowledge(msg.sender);
        }
        dispute(jobId, evidenceHash);
    }

    /// @notice Resolve a dispute relayed by the dispute module.
    /// @dev When the employer wins the dispute the job is immediately
    ///      finalised – escrowed funds are returned to the employer and the
    ///      agent's stake is slashed. If the agent wins, the job moves back to
    ///      the completed state so it can be finalised normally via
    ///      {finalize}.
    /// @param jobId Identifier of the disputed job
    /// @param employerWins True if the employer won the dispute
    function resolveDispute(uint256 jobId, bool employerWins) external {
        require(msg.sender == address(disputeModule), "only dispute");
        Job storage job = jobs[jobId];
        require(job.state == State.Disputed, "no dispute");

        job.success = !employerWins;
        job.state = State.Completed;
        emit DisputeResolved(jobId, employerWins);
        finalize(jobId);
    }

    /// @notice Finalize a job and trigger payouts and reputation changes.
    /// @dev The dispute module may call this without acknowledgement as it
    ///      merely relays the arbiter's ruling and holds no tax liability.
    function finalize(uint256 jobId)
        public
        whenNotPaused
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
        nonReentrant
    {
        _finalize(jobId);
    }

    function _finalize(uint256 jobId) internal whenNotPaused {
        Job storage job = jobs[jobId];
        require(job.state == State.Completed, "not ready");
        bool isGov = msg.sender == address(governance);
        bool agentBlacklisted;
        bool employerBlacklisted;
        if (address(reputationEngine) != address(0)) {
            agentBlacklisted = reputationEngine.isBlacklisted(job.agent);
            employerBlacklisted = reputationEngine.isBlacklisted(job.employer);
            if (!isGov) {
                require(
                    !reputationEngine.isBlacklisted(msg.sender),
                    "Blacklisted"
                );
                require(!agentBlacklisted, "Blacklisted agent");
                require(!employerBlacklisted, "Blacklisted employer");
            }
        }
        job.state = State.Finalized;
        bytes32 jobKey = bytes32(jobId);
        bool fundsRedirected;
        if (job.success) {
            IFeePool pool = feePool;
            address[] memory validators;
            uint256 validatorReward;
            if (address(validationModule) != address(0)) {
                validators = validationModule.validators(jobId);
                if (validatorRewardPct > 0) {
                    validatorReward =
                        (uint256(job.reward) * validatorRewardPct) / 100;
                }
            }

            uint256 rewardAfterValidator =
                uint256(job.reward) - validatorReward;
            if (address(stakeManager) != address(0)) {
                uint256 fee;
                if (address(pool) != address(0) && job.reward > 0) {
                    fee = (uint256(job.reward) * job.feePct) / 100;
                }
                address payee = job.agent;
                if (isGov && treasury != address(0) && agentBlacklisted) {
                    payee = treasury;
                    fundsRedirected = true;
                }
                stakeManager.finalizeJobFunds(
                    jobKey,
                    payee,
                    rewardAfterValidator,
                    fee,
                    pool
                );

                if (validatorReward > 0) {
                    if (validators.length > 0) {
                        stakeManager.distributeValidatorRewards(
                            jobKey,
                            validatorReward
                        );
                    } else {
                        stakeManager.releaseReward(
                            jobKey,
                            payee,
                            validatorReward
                        );
                    }
                }
                if (job.stake > 0) {
                    if (isGov && treasury != address(0) && agentBlacklisted) {
                        stakeManager.slash(
                            job.agent,
                            IStakeManager.Role.Agent,
                            uint256(job.stake),
                            treasury
                        );
                    } else {
                        stakeManager.releaseStake(job.agent, uint256(job.stake));
                    }
                }
            }
            if (address(reputationEngine) != address(0)) {
                uint256 agentPct = 100;
                if (address(stakeManager) != address(0)) {
                    agentPct = stakeManager.getAgentPayoutPct(job.agent);
                }
                uint256 agentModified =
                    (rewardAfterValidator * agentPct) / 100;
                uint256 burn = 0;
                if (address(stakeManager) != address(0)) {
                    burn = (agentModified * stakeManager.burnPct()) / 100;
                }
                uint256 agentAmount = agentModified - burn;
                uint256 completionTime = block.timestamp - job.assignedAt;
                uint256 payout = agentAmount * 1e12;
                uint256 agentGain = reputationEngine.calculateReputationPoints(
                    payout,
                    completionTime
                );
                reputationEngine.onFinalize(
                    job.agent,
                    true,
                    payout,
                    completionTime
                );
                if (validators.length > 0) {
                    for (uint256 i; i < validators.length;) {
                        address val = validators[i];
                        if (validationModule.votes(jobId, val)) {
                            reputationEngine.rewardValidator(val, agentGain);
                        }
                        unchecked {
                            ++i;
                        }
                    }
                }
            }
            if (address(certificateNFT) != address(0)) {
                certificateNFT.mint(job.agent, jobId, job.uriHash);
            }
        } else {
            if (address(stakeManager) != address(0)) {
                uint256 fee = (uint256(job.reward) * job.feePct) / 100;
                address recipient = job.employer;
                if (isGov && treasury != address(0) && employerBlacklisted) {
                    recipient = treasury;
                    fundsRedirected = true;
                }
                if (job.reward > 0) {
                    stakeManager.releaseReward(
                        jobKey,
                        recipient,
                        uint256(job.reward) + fee
                    );
                }
                if (job.stake > 0) {
                    stakeManager.slash(
                        job.agent,
                        IStakeManager.Role.Agent,
                        uint256(job.stake),
                        recipient
                    );
                }
            }
            if (address(reputationEngine) != address(0)) {
                reputationEngine.onFinalize(job.agent, false, 0, 0);
            }
        }
        emit JobFinalized(jobId, job.agent);
        if (isGov) {
            emit GovernanceFinalized(jobId, msg.sender, fundsRedirected);
        }
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

    /// @notice Cancel an unassigned job and refund the employer.
    /// @dev Convenience wrapper matching earlier interface expectations.
    /// Calls {cancelJob} which handles tax acknowledgement checks and
    /// refunds any locked reward back to the employer.
    /// @param jobId Identifier of the job to cancel.
    function cancel(uint256 jobId) external {
        cancelJob(jobId);
    }

    /// @notice Cancel a job before completion and refund the employer.
    function _cancelJob(uint256 jobId) internal whenNotPaused {
        Job storage job = jobs[jobId];
        require(
            job.state == State.Created && job.agent == address(0),
            "cannot cancel"
        );
        job.state = State.Cancelled;
        if (address(stakeManager) != address(0) && job.reward > 0) {
            uint256 fee = (uint256(job.reward) * job.feePct) / 100;
            stakeManager.releaseReward(
                bytes32(jobId),
                job.employer,
                uint256(job.reward) + fee
            );
        }
        emit JobCancelled(jobId);
    }

    function cancelJob(uint256 jobId)
        public
        requiresTaxAcknowledgement(
            taxPolicy,
            msg.sender,
            owner(),
            address(disputeModule),
            address(validationModule)
        )
    {
        Job storage job = jobs[jobId];
        require(msg.sender == job.employer, "only employer");
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "Blacklisted employer"
            );
        }
        _cancelJob(jobId);
    }

    /// @notice Owner can delist an unassigned job and refund the employer.
    /// @param jobId Identifier of the job to delist.
    function delistJob(uint256 jobId) external onlyGovernance {
        _cancelJob(jobId);
    }

    /// @notice Cancel an assigned job that failed to submit before its deadline.
    /// Any address may trigger this after the deadline has passed.
    /// @param jobId Identifier of the job to cancel.
    function cancelExpiredJob(uint256 jobId)
        public
        onlyAfterDeadline(jobId)
        whenNotPaused
        nonReentrant
    {
        Job storage job = jobs[jobId];
        job.success = false;
        job.state = State.Completed;
        _finalize(jobId);
        emit JobExpired(jobId, msg.sender);
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


