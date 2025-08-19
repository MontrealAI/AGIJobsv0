// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ITaxPolicy} from "./interfaces/ITaxPolicy.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IFeePool} from "./interfaces/IFeePool.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";
import {ICertificateNFT} from "./interfaces/ICertificateNFT.sol";

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
        uint64 start;
        State state;
        bool success;
        string uri;
        string result;
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

    /// @notice Current version of the tax policy. Participants must acknowledge
    /// this version before interacting. The contract owner remains exempt.
    uint256 public taxPolicyVersion;

    /// @notice Tracks which policy version each participant acknowledged.
    /// @dev Mapping is public for off-chain auditability.
    mapping(address => uint256) public taxAcknowledgedVersion;

    /// @notice Addresses allowed to acknowledge the tax policy for others.
    mapping(address => bool) public acknowledgers;

    /// @dev Reusable gate enforcing acknowledgement of the latest tax policy
    /// version for callers other than the owner, dispute module, or validation module.
    modifier requiresTaxAcknowledgement() {
        if (
            msg.sender != owner() &&
            msg.sender != address(disputeModule) &&
            msg.sender != address(validationModule)
        ) {
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
    uint256 public maxJobDuration;
    uint256 public validatorRewardPct;
    uint256 public constant DEFAULT_VALIDATOR_REWARD_PCT = 8;

    // module configuration events
    event ModuleUpdated(string module, address newAddress);
    event ValidationModuleUpdated(address module);
    event StakeManagerUpdated(address manager);
    event ReputationEngineUpdated(address engine);
    event DisputeModuleUpdated(address module);
    event CertificateNFTUpdated(address nft);
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
        uint256 fee
    );
    event JobApplied(uint256 indexed jobId, address indexed agent);
    event JobSubmitted(uint256 indexed jobId, string result);
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
        IIdentityRegistry _identity,
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
        identityRegistry = _identity;
        feePool = _feePool;
        uint256 pct = _feePct == 0 ? DEFAULT_FEE_PCT : _feePct;
        require(pct <= 100, "pct");
        feePct = pct;
        jobStake = _jobStake == 0 ? DEFAULT_JOB_STAKE : _jobStake;
        validatorRewardPct = DEFAULT_VALIDATOR_REWARD_PCT;
        emit ValidatorRewardPctUpdated(validatorRewardPct);
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
        if (address(_identity) != address(0)) {
            emit ModuleUpdated("IdentityRegistry", address(_identity));
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
    // Setters below are executed manually via Etherscan's "Write Contract"
    // tab using the authorized owner account.
    function setModules(
        IValidationModule _validation,
        IStakeManager _stakeMgr,
        IReputationEngine _reputation,
        IDisputeModule _dispute,
        ICertificateNFT _certNFT,
        IIdentityRegistry _identity,
        address[] calldata _ackModules
    ) external onlyOwner {
        require(address(_validation) != address(0), "validation");
        require(address(_stakeMgr) != address(0), "stake");
        require(address(_reputation) != address(0), "reputation");
        require(address(_dispute) != address(0), "dispute");
        require(address(_certNFT) != address(0), "nft");
        require(address(_identity) != address(0), "identity");

        validationModule = _validation;
        stakeManager = _stakeMgr;
        acknowledgers[address(_stakeMgr)] = true;
        emit AcknowledgerUpdated(address(_stakeMgr), true);
        reputationEngine = _reputation;
        disputeModule = _dispute;
        certificateNFT = _certNFT;
        identityRegistry = _identity;
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
        emit ModuleUpdated("IdentityRegistry", address(_identity));
        for (uint256 i; i < _ackModules.length; i++) {
            acknowledgers[_ackModules[i]] = true;
            emit AcknowledgerUpdated(_ackModules[i], true);
        }
    }

    /// @notice Update the identity registry contract used for agent authorization.
    function setIdentityRegistry(IIdentityRegistry registry) external onlyOwner {
        identityRegistry = registry;
        emit ModuleUpdated("IdentityRegistry", address(registry));
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

    /// @notice update validator reward percentage of job reward
    function setValidatorRewardPct(uint256 pct) external onlyOwner {
        require(pct <= 100, "pct");
        validatorRewardPct = pct;
        emit ValidatorRewardPctUpdated(pct);
    }

    /// @notice set the maximum allowed job reward
    function setMaxJobReward(uint256 maxReward) external onlyOwner {
        maxJobReward = maxReward;
        emit JobParametersUpdated(0, jobStake, maxReward, maxJobDuration);
    }

    /// @notice set the maximum allowed job duration in seconds
    function setMaxJobDuration(uint256 limit) external onlyOwner {
        maxJobDuration = limit;
        emit JobParametersUpdated(0, jobStake, maxJobReward, limit);
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
        emit JobParametersUpdated(reward, stake, maxJobReward, maxJobDuration);
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
            uint256(deadline) - block.timestamp <= maxJobDuration,
            "duration"
        );
        require(feePct + validatorRewardPct <= 100, "pct");
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
            start: uint64(block.timestamp),
            state: State.Created,
            success: false,
            uri: uri,
            result: ""
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
        if (address(identityRegistry) != address(0)) {
            require(
                identityRegistry.isAuthorizedAgent(
                    msg.sender,
                    subdomain,
                    proof
                ),
                "Not authorized agent"
            );
        }
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "Blacklisted agent"
            );
            reputationEngine.onApply(msg.sender);
        }
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
        emit JobApplied(jobId, msg.sender);
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
    /// @param result Metadata URI describing the completed work.
    function submitJob(uint256 jobId, string calldata result)
        public
        requiresTaxAcknowledgement
    {
        Job storage job = jobs[jobId];
        require(job.state == State.Applied, "invalid state");
        require(msg.sender == job.agent, "only agent");
        require(block.timestamp <= job.deadline, "deadline passed");
        job.result = result;
        job.state = State.Submitted;
        emit JobSubmitted(jobId, result);
        if (address(validationModule) != address(0)) {
            validationModule.selectValidators(jobId);
        }
    }

    /// @notice Legacy wrapper for `submitJob`.
    function submit(uint256 jobId, string calldata result) public {
        submitJob(jobId, result);
    }

    /// @notice Acknowledge the tax policy and submit work in one call.
    function acknowledgeAndSubmit(uint256 jobId, string calldata result) external {
        _acknowledge(msg.sender);
        submitJob(jobId, result);
    }

    /// @notice Callback invoked by the validation module when voting concludes.
    /// @param jobId Identifier of the job being finalised.
    /// @param success True if validators approved the job.
    function validationComplete(uint256 jobId, bool success) public {
        require(msg.sender == address(validationModule), "only validation");
        Job storage job = jobs[jobId];
        require(job.state == State.Submitted, "not submitted");
        job.success = success;
        job.state = success ? State.Completed : State.Disputed;
        emit JobCompleted(jobId, success);
        if (success) {
            finalize(jobId);
        }
    }

    /// @notice Legacy wrapper for {validationComplete}.
    function finalizeAfterValidation(uint256 jobId, bool success) external {
        validationComplete(jobId, success);
    }

    /// @notice Agent or employer disputes a job outcome with supporting evidence.
    /// @param jobId Identifier of the disputed job.
    /// @param evidence Supporting evidence for the dispute.
    function dispute(uint256 jobId, string calldata evidence)
        public
        requiresTaxAcknowledgement
    {
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
        if (address(disputeModule) != address(0)) {
            disputeModule.raiseDispute(jobId, msg.sender, evidence);
        }
        emit JobDisputed(jobId, msg.sender);
    }

    /// @notice Backwards-compatible wrapper for legacy integrations.
    /// @dev Calls {dispute} with the provided evidence.
    function raiseDispute(uint256 jobId, string calldata evidence) public {
        dispute(jobId, evidence);
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
        dispute(jobId, evidence);
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
        requiresTaxAcknowledgement
        nonReentrant
    {
        Job storage job = jobs[jobId];
        require(job.state == State.Completed, "not ready");
        job.state = State.Finalized;
        bytes32 jobKey = bytes32(jobId);
        uint256 duration = block.timestamp - uint256(job.start);
        if (job.success) {
            IFeePool pool = feePool;
            uint256 agentReward = uint256(job.reward);
            if (address(stakeManager) != address(0)) {
                uint256 fee;
                if (address(pool) != address(0) && job.reward > 0) {
                    fee = (uint256(job.reward) * job.feePct) / 100;
                }

                // determine validator payout before calculating agent reward
                address[] memory vals;
                uint256 validatorReward;
                uint256 perValidator;
                if (
                    validatorRewardPct > 0 &&
                    address(validationModule) != address(0)
                ) {
                    vals = validationModule.validators(jobId);
                    if (vals.length > 0) {
                        validatorReward =
                            (uint256(job.reward) * validatorRewardPct) /
                            100;
                        perValidator = validatorReward / vals.length;
                    }
                }

                // agent payout is based on remaining reward after validator share
                uint256 agentPct = stakeManager.getHighestPayoutPercentage(
                    job.agent
                );
                uint256 rewardAfterValidator =
                    uint256(job.reward) - validatorReward;
                agentReward = (rewardAfterValidator * agentPct) / 100;

                stakeManager.finalizeJobFunds(
                    jobKey,
                    job.agent,
                    agentReward,
                    fee,
                    pool
                );

                if (validatorReward > 0) {
                    for (uint256 i; i < vals.length; ++i) {
                        stakeManager.releaseJobFunds(
                            jobKey,
                            vals[i],
                            perValidator
                        );
                    }
                }

                uint256 leftover =
                    rewardAfterValidator - agentReward;
                if (leftover > 0) {
                    stakeManager.releaseJobFunds(jobKey, job.employer, leftover);
                }
            }
            if (address(reputationEngine) != address(0)) {
                reputationEngine.onFinalize(
                    job.agent,
                    true,
                    agentReward,
                    duration
                );
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
                reputationEngine.onFinalize(job.agent, false, 0, duration);
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
        require(job.state == State.Created && job.agent == address(0), "cannot cancel");
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

    /// @notice Owner can force-cancel an unassigned job and refund the employer.
    /// @param jobId Identifier of the job to cancel.
    function forceCancel(uint256 jobId) external onlyOwner {
        Job storage job = jobs[jobId];
        require(job.state == State.Created && job.agent == address(0), "cannot cancel");
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


