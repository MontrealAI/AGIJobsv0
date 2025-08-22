// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IJobRegistryTax} from "./interfaces/IJobRegistryTax.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {ReputationEngine} from "./ReputationEngine.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IVRF} from "./interfaces/IVRF.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";

/// @title ValidationModule
/// @notice Handles validator selection and commit–reveal voting for jobs.
/// @dev Holds no ether and keeps the owner and contract tax neutral; only
///      participating validators and job parties bear tax obligations.
contract ValidationModule is IValidationModule, Ownable {
    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    IIdentityRegistry public identityRegistry;

    // timing configuration
    uint256 public commitWindow;
    uint256 public revealWindow;

    // validator bounds per job
    uint256 public minValidators;
    uint256 public maxValidators;

    uint256 public constant DEFAULT_COMMIT_WINDOW = 1 days;
    uint256 public constant DEFAULT_REVEAL_WINDOW = 1 days;
    uint256 public constant DEFAULT_MIN_VALIDATORS = 1;
    uint256 public constant DEFAULT_MAX_VALIDATORS = 3;

    // slashing percentage applied to validator stake for incorrect votes
    uint256 public validatorSlashingPercentage = 50;
    // percentage of total stake required for approval
    uint256 public approvalThreshold = 50;

    // pool of validators
    address[] public validatorPool;
    // optional VRF provider for future randomness upgrades
    IVRF public vrf;

    // optional override for validators without ENS identity
    mapping(address => string) public validatorSubdomains;

    struct Round {
        address[] validators;
        address[] participants;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 approvals;
        uint256 rejections;
        bool tallied;
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => mapping(uint256 => bytes32))) public commitments;
    mapping(uint256 => mapping(address => bool)) public revealed;
    mapping(uint256 => mapping(address => bool)) public votes;
    mapping(uint256 => mapping(address => uint256)) public validatorStakes;
    mapping(uint256 => uint256) public jobNonce;

    event ValidatorsUpdated(address[] validators);
    event ReputationEngineUpdated(address engine);
    event VRFUpdated(address vrf);
    event TimingUpdated(uint256 commitWindow, uint256 revealWindow);
    event ValidatorBoundsUpdated(uint256 minValidators, uint256 maxValidators);
    event ValidatorSlashingPctUpdated(uint256 pct);
    event ApprovalThresholdUpdated(uint256 pct);
    event JobRegistryUpdated(address registry);
    event StakeManagerUpdated(address manager);
    event ModulesUpdated(address indexed jobRegistry, address indexed stakeManager);
    event IdentityRegistryUpdated(address registry);
    event JobNonceReset(uint256 indexed jobId);
    /// @notice Emitted when an additional validator is added or removed.
    /// @param validator Address being updated.
    /// @param allowed True if the validator is whitelisted, false if removed.

    /// @notice Require caller to acknowledge current tax policy via JobRegistry.
    modifier requiresTaxAcknowledgement() {
        if (msg.sender != owner()) {
            address registry = address(jobRegistry);
            require(registry != address(0), "job registry");
            IJobRegistryTax j = IJobRegistryTax(registry);
            require(
                j.taxAcknowledgedVersion(msg.sender) == j.taxPolicyVersion(),
                "acknowledge tax policy"
            );
        }
        _;
    }

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        uint256 _commitWindow,
        uint256 _revealWindow,
        uint256 _minValidators,
        uint256 _maxValidators,
        address[] memory _validatorPool
    ) Ownable(msg.sender) {
        if (address(_jobRegistry) != address(0)) {
            jobRegistry = _jobRegistry;
            emit JobRegistryUpdated(address(_jobRegistry));
        }
        if (address(_stakeManager) != address(0)) {
            stakeManager = _stakeManager;
            emit StakeManagerUpdated(address(_stakeManager));
        }
        if (
            address(_jobRegistry) != address(0) ||
            address(_stakeManager) != address(0)
        ) {
            emit ModulesUpdated(
                address(_jobRegistry),
                address(_stakeManager)
            );
        }
        commitWindow =
            _commitWindow == 0 ? DEFAULT_COMMIT_WINDOW : _commitWindow;
        revealWindow =
            _revealWindow == 0 ? DEFAULT_REVEAL_WINDOW : _revealWindow;
        emit TimingUpdated(commitWindow, revealWindow);

        minValidators =
            _minValidators == 0 ? DEFAULT_MIN_VALIDATORS : _minValidators;
        maxValidators =
            _maxValidators == 0 ? DEFAULT_MAX_VALIDATORS : _maxValidators;
        emit ValidatorBoundsUpdated(minValidators, maxValidators);

        emit ApprovalThresholdUpdated(approvalThreshold);

        require(commitWindow > 0 && revealWindow > 0, "windows");
        require(maxValidators >= minValidators, "bounds");
        if (_validatorPool.length != 0) {
            validatorPool = _validatorPool;
            emit ValidatorsUpdated(_validatorPool);
        }
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Update the list of eligible validators.
    /// @param newPool Addresses of validators.
    function setValidatorPool(address[] calldata newPool)
        external
        onlyOwner
    {
        validatorPool = newPool;
        emit ValidatorsUpdated(newPool);
    }

    /// @notice Update the reputation engine used for validator feedback.
    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    /// @notice Update the JobRegistry reference.
    function setJobRegistry(IJobRegistry registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(address(registry));
        emit ModulesUpdated(address(registry), address(stakeManager));
    }

    /// @notice Update the StakeManager reference.
    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
        emit ModulesUpdated(address(jobRegistry), address(manager));
    }

    /// @notice Set the optional VRF provider for future upgrades.
    function setVRF(IVRF provider) external onlyOwner {
        vrf = provider;
        emit VRFUpdated(address(provider));
    }

    /// @notice Update the identity registry used for validator verification.
    function setIdentityRegistry(IIdentityRegistry registry) external onlyOwner {
        identityRegistry = registry;
        emit IdentityRegistryUpdated(address(registry));
    }

    /// @notice Batch update core validation parameters.
    /// @param committeeSize Number of validators selected per job.
    /// @param commitDur Duration of the commit phase in seconds.
    /// @param revealDur Duration of the reveal phase in seconds.
    /// @param approvalPct Percentage of stake required for approval.
    /// @param slashPct Percentage of stake slashed for incorrect votes.
    function setParameters(
        uint256 committeeSize,
        uint256 commitDur,
        uint256 revealDur,
        uint256 approvalPct,
        uint256 slashPct
    ) external override onlyOwner {
        require(committeeSize > 0, "committee");
        require(commitDur > 0 && revealDur > 0, "windows");
        require(approvalPct > 0 && approvalPct <= 100, "approval");
        require(slashPct <= 100, "slash");

        minValidators = committeeSize;
        maxValidators = committeeSize;
        commitWindow = commitDur;
        revealWindow = revealDur;
        approvalThreshold = approvalPct;
        validatorSlashingPercentage = slashPct;

        emit ValidatorBoundsUpdated(committeeSize, committeeSize);
        emit TimingUpdated(commitDur, revealDur);
        emit ApprovalThresholdUpdated(approvalPct);
        emit ValidatorSlashingPctUpdated(slashPct);
        emit ParametersUpdated(
            committeeSize,
            commitDur,
            revealDur,
            approvalPct,
            slashPct
        );
    }

    /// @notice Return validators selected for a job
    /// @param jobId Identifier of the job
    /// @return validators_ Array of validator addresses
    function validators(uint256 jobId) external view override returns (address[] memory validators_) {
        Round storage r = rounds[jobId];
        validators_ = r.tallied ? r.participants : r.validators;
    }

    /// @notice Map validators to their ENS subdomains for selection-time checks.
    /// @param accounts Validator addresses to configure.
    /// @param subdomains ENS labels owned by each validator.
    function setValidatorSubdomains(
        address[] calldata accounts,
        string[] calldata subdomains
    ) external onlyOwner {
        require(accounts.length == subdomains.length, "length");
        for (uint256 i; i < accounts.length; ++i) {
            validatorSubdomains[accounts[i]] = subdomains[i];
            emit ValidatorSubdomainUpdated(accounts[i], subdomains[i]);
        }
    }

    /// @notice Update the commit and reveal windows.
    function setCommitRevealWindows(uint256 commitDur, uint256 revealDur)
        external
        override
        onlyOwner
    {
        require(commitDur > 0 && revealDur > 0, "windows");
        commitWindow = commitDur;
        revealWindow = revealDur;
        emit TimingUpdated(commitDur, revealDur);
    }

    /// @notice Convenience wrapper matching original API naming.
    /// @dev Alias for {setCommitRevealWindows}.
    function setTiming(uint256 commitDur, uint256 revealDur)
        external
        onlyOwner
    {
        require(commitDur > 0 && revealDur > 0, "windows");
        commitWindow = commitDur;
        revealWindow = revealDur;
        emit TimingUpdated(commitDur, revealDur);
    }

    /// @notice Set minimum and maximum validators per round.
    function setValidatorBounds(uint256 minVals, uint256 maxVals) external override onlyOwner {
        require(minVals > 0 && maxVals >= minVals, "bounds");
        minValidators = minVals;
        maxValidators = maxVals;
        emit ValidatorBoundsUpdated(minVals, maxVals);
    }

    /// @notice Individually update commit window duration.
    function setCommitWindow(uint256 commitDur) external onlyOwner {
        require(commitDur > 0, "commit");
        commitWindow = commitDur;
        emit TimingUpdated(commitDur, revealWindow);
    }

    /// @notice Individually update reveal window duration.
    function setRevealWindow(uint256 revealDur) external onlyOwner {
        require(revealDur > 0, "reveal");
        revealWindow = revealDur;
        emit TimingUpdated(commitWindow, revealDur);
    }

    /// @notice Individually update minimum validators.
    function setMinValidators(uint256 minVals) external onlyOwner {
        require(minVals > 0 && minVals <= maxValidators, "bounds");
        minValidators = minVals;
        emit ValidatorBoundsUpdated(minVals, maxValidators);
    }

    /// @notice Individually update maximum validators.
    function setMaxValidators(uint256 maxVals) external onlyOwner {
        require(maxVals >= minValidators && maxVals > 0, "bounds");
        maxValidators = maxVals;
        emit ValidatorBoundsUpdated(minValidators, maxVals);
    }

    function setValidatorSlashingPct(uint256 pct) external onlyOwner {
        require(pct <= 100, "pct");
        validatorSlashingPercentage = pct;
        emit ValidatorSlashingPctUpdated(pct);
    }

    /// @notice Update approval threshold percentage.
    function setApprovalThreshold(uint256 pct) external onlyOwner {
        require(pct > 0 && pct <= 100, "pct");
        approvalThreshold = pct;
        emit ApprovalThresholdUpdated(pct);
    }

    /// @inheritdoc IValidationModule
    function selectValidators(uint256 jobId) public override returns (address[] memory selected) {
        Round storage r = rounds[jobId];
        require(r.validators.length == 0, "already selected");
        require(address(identityRegistry) != address(0), "identity reg");
        jobNonce[jobId] += 1;

        address[] memory pool = validatorPool;
        uint256 n = pool.length;
        uint256[] memory stakes = new uint256[](n);
        uint256[] memory hashes = new uint256[](n);
        uint256 m;

        for (uint256 i; i < n; ++i) {
            address candidate = pool[i];
            uint256 stake = stakeManager.stakeOf(
                candidate,
                IStakeManager.Role.Validator
            );
            if (stake == 0) continue;
            if (address(reputationEngine) != address(0)) {
                if (reputationEngine.isBlacklisted(candidate)) continue;
            }
            bytes32[] memory proof;
            string memory subdomain = validatorSubdomains[candidate];
            bool authorized = identityRegistry.isAuthorizedValidator(
                candidate,
                subdomain,
                proof
            );
            if (!authorized) continue;
            pool[m] = candidate;
            stakes[m] = stake;
            hashes[m] = uint256(
                keccak256(abi.encodePacked(jobId, jobNonce[jobId], candidate))
            );
            m++;
        }

        require(m >= minValidators, "insufficient validators");
        uint256 count = m < maxValidators ? m : maxValidators;

        // deterministic selection based on hash ordering
        for (uint256 i; i < count; ++i) {
            uint256 minIndex = i;
            for (uint256 j = i + 1; j < m; ++j) {
                if (hashes[j] < hashes[minIndex]) {
                    minIndex = j;
                }
            }
            // place chosen validator at current index
            if (minIndex != i) {
                (pool[i], pool[minIndex]) = (pool[minIndex], pool[i]);
                (stakes[i], stakes[minIndex]) = (stakes[minIndex], stakes[i]);
                (hashes[i], hashes[minIndex]) = (hashes[minIndex], hashes[i]);
            }
        }

        selected = new address[](count);
        for (uint256 i; i < count; ++i) {
            address val = pool[i];
            selected[i] = val;
            validatorStakes[jobId][val] = stakes[i];
        }

        r.validators = selected;
        r.commitDeadline = block.timestamp + commitWindow;
        r.revealDeadline = r.commitDeadline + revealWindow;

        emit ValidatorsSelected(jobId, selected);
        return selected;
    }

    /// @inheritdoc IValidationModule
    function startValidation(uint256 jobId, string calldata /*result*/)
        external
        override
        returns (address[] memory validators)
    {
        validators = selectValidators(jobId);
    }

    /// @notice Commit a validation hash for a job.
    function commitValidation(
        uint256 jobId,
        bytes32 commitHash,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public override requiresTaxAcknowledgement {
        Round storage r = rounds[jobId];
        require(
            jobRegistry.jobs(jobId).status == IJobRegistry.Status.Submitted,
            "not submitted"
        );
        require(
            r.commitDeadline != 0 && block.timestamp <= r.commitDeadline,
            "commit closed"
        );
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "Blacklisted validator"
            );
        }
        require(address(identityRegistry) != address(0), "identity reg");
        require(_isValidator(jobId, msg.sender), "not validator");
        bool authorized = identityRegistry.verifyValidator(
            msg.sender,
            subdomain,
            proof
        );
        require(authorized, "Not authorized validator");
        require(validatorStakes[jobId][msg.sender] > 0, "stake");
        uint256 nonce = jobNonce[jobId];
        require(
            commitments[jobId][msg.sender][nonce] == bytes32(0),
            "already committed"
        );

        commitments[jobId][msg.sender][nonce] = commitHash;
        emit ValidationCommitted(jobId, msg.sender, commitHash);
    }

    /// @notice Backwards-compatible commit function without ENS parameters.
    /// @param jobId Identifier of the job.
    /// @param commitHash Hash of the vote and salt.
    function commitValidation(uint256 jobId, bytes32 commitHash)
        public
        override
        requiresTaxAcknowledgement
    {
        bytes32[] memory proof;
        this.commitValidation(jobId, commitHash, "", proof);
    }

    /// @notice Reveal a previously committed validation vote.
    function revealValidation(
        uint256 jobId,
        bool approve,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public override requiresTaxAcknowledgement {
        Round storage r = rounds[jobId];
        require(block.timestamp > r.commitDeadline, "commit phase");
        require(block.timestamp <= r.revealDeadline, "reveal closed");
        if (address(reputationEngine) != address(0)) {
            require(
                !reputationEngine.isBlacklisted(msg.sender),
                "Blacklisted validator"
            );
        }
        require(address(identityRegistry) != address(0), "identity reg");
        bool authorized = identityRegistry.verifyValidator(
            msg.sender,
            subdomain,
            proof
        );
        require(authorized, "Not authorized validator");
        uint256 nonce = jobNonce[jobId];
        bytes32 commitHash = commitments[jobId][msg.sender][nonce];
        require(commitHash != bytes32(0), "no commit");
        require(!revealed[jobId][msg.sender], "already revealed");
        require(
            keccak256(abi.encodePacked(jobId, nonce, approve, salt)) == commitHash,
            "invalid reveal"
        );

        uint256 stake = validatorStakes[jobId][msg.sender];
        require(stake > 0, "stake");
        revealed[jobId][msg.sender] = true;
        votes[jobId][msg.sender] = approve;
        r.participants.push(msg.sender);
        if (approve) r.approvals += stake; else r.rejections += stake;

        emit ValidationRevealed(jobId, msg.sender, approve);
    }

    /// @notice Backwards-compatible reveal function without ENS parameters.
    /// @param jobId Identifier of the job.
    /// @param approve True to approve, false to reject.
    /// @param salt Salt used in the original commitment.
    function revealValidation(uint256 jobId, bool approve, bytes32 salt)
        public
        override
        requiresTaxAcknowledgement
    {
        bytes32[] memory proof;
        this.revealValidation(jobId, approve, salt, "", proof);
    }

    /// @notice Backwards-compatible wrapper for commitValidation.
    function commitVote(
        uint256 jobId,
        bytes32 commitHash,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external requiresTaxAcknowledgement {
        commitValidation(jobId, commitHash, subdomain, proof);
    }

    /// @notice Backwards-compatible wrapper for revealValidation.
    function revealVote(
        uint256 jobId,
        bool approve,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external requiresTaxAcknowledgement {
        revealValidation(jobId, approve, salt, subdomain, proof);
    }

    /// @notice Tally revealed votes, apply slashing/rewards, and push result to JobRegistry.
    function finalize(uint256 jobId) external override returns (bool success) {
        Round storage r = rounds[jobId];
        require(!r.tallied, "tallied");
        require(block.timestamp > r.revealDeadline, "reveal pending");

        uint256 total = r.approvals + r.rejections;
        bool allRevealed = r.participants.length == r.validators.length;
        bool quorum = r.participants.length >= minValidators;
        if (allRevealed && quorum && total > 0) {
            success = (r.approvals * 100) >= (total * approvalThreshold);
        } else {
            success = false;
        }
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        uint256 agentGain;
        if (address(reputationEngine) != address(0) && success) {
            uint256 payout = uint256(job.reward) * 1e12;
            // attempt to derive validator reward from reputation engine
            try
                ReputationEngine(payable(address(reputationEngine)))
                    .calculateReputationPoints(payout, 0)
            returns (uint256 points) {
                agentGain = points;
            } catch {
                agentGain = 1;
            }
        }

        for (uint256 i; i < r.validators.length; ++i) {
            address val = r.validators[i];
            uint256 stake = validatorStakes[jobId][val];
            uint256 slashAmount = (stake * validatorSlashingPercentage) / 100;
            if (!revealed[jobId][val] || votes[jobId][val] != success) {
                if (slashAmount > 0) {
                    stakeManager.slash(
                        val,
                        IStakeManager.Role.Validator,
                        slashAmount,
                        job.employer
                    );
                }
                if (address(reputationEngine) != address(0)) {
                    reputationEngine.subtract(val, 1);
                }
            } else if (address(reputationEngine) != address(0)) {
                reputationEngine.rewardValidator(val, agentGain);
            }
        }

        r.tallied = true;
        emit ValidationTallied(jobId, success, r.approvals, r.rejections);
        emit ValidationResult(jobId, success);

        jobRegistry.validationComplete(jobId, success);
        return success;
    }

    /// @notice Alias for {finalize} using legacy naming.
    /// @param jobId Identifier of the job.
    /// @return success True if validators approved the job.
    function finalizeValidation(uint256 jobId)
        external
        override
        returns (bool success)
    {
        return this.finalize(jobId);
    }

    /// @notice Reset the validation nonce for a job after finalization or dispute resolution.
    /// @param jobId Identifier of the job
    function resetJobNonce(uint256 jobId) external override {
        require(
            msg.sender == owner() || msg.sender == address(jobRegistry),
            "not authorized"
        );
        uint256 nonce = jobNonce[jobId];
        address[] storage vals = rounds[jobId].validators;
        for (uint256 i; i < vals.length; ++i) {
            address val = vals[i];
            delete commitments[jobId][val][nonce];
            delete revealed[jobId][val];
            delete votes[jobId][val];
            delete validatorStakes[jobId][val];
        }
        delete rounds[jobId];
        delete jobNonce[jobId];
        emit JobNonceReset(jobId);
    }

    function _isValidator(uint256 jobId, address val) internal view returns (bool) {
        address[] storage list = rounds[jobId].validators;
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == val) return true;
        }
        return false;
    }

    /// @notice Confirms the contract and its owner can never accrue tax obligations.
    /// @return Always true to signal perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Prevent accidental ETH deposits; the module never holds funds.
    receive() external payable {
        revert("ValidationModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("ValidationModule: no ether");
    }
}

