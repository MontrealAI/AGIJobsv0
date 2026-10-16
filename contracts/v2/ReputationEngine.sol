// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IReputationEngineV2} from "./interfaces/IReputationEngineV2.sol";
import {TOKEN_SCALE} from "./Constants.sol";
import {ITerminalJobRegistry} from "./interfaces/ITerminalReputation.sol";

/// @title ReputationEngine
/// @notice Tracks reputation scores with blacklist enforcement.
/// Only authorised callers may update scores.
/// @dev Holds no funds and rejects ether. Protocol flags do not determine
///      the legal or tax obligations of any contract participant or owner.
contract ReputationEngine is Ownable, Pausable, IReputationEngineV2 {
    error NotOwnerOrPauserManager();
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 3;

    /// @notice Exact capability identity for terminal-only, 18-decimal job scoring.
    bytes32 public constant terminalPolicyId = keccak256("AGIJobs:terminal-reputation-v3");

    /// @notice Scaling divisor for the cubed payout component.
    uint256 public constant PAYOUT_SCALE = 1e5;

    /// @notice Multiplier applied before the logarithm to widen reputation gain.
    /// @dev Dimensionless constant tuned for 18-decimal payouts. Since `payout`
    ///      is first scaled down by {TOKEN_SCALE} to whole tokens, this value
    ///      does not require adjustment when changing token precision from 6 to
    ///      18 decimals.
    uint256 public constant LOG_FACTOR = 1e6;

    /// @notice Historical duration divisor retained for ABI compatibility.
    /// @dev Legacy ABI constant only; elapsed duration earns no points under v3.
    uint256 public constant DURATION_SCALE = 10_000;

    /// @notice Denominator for percentage calculations (100%).
    uint256 public constant PERCENTAGE_SCALE = 100;

    /// @notice Default percentage of agent gain awarded to validators.
    uint256 public constant DEFAULT_VALIDATION_REWARD_PERCENTAGE = 8;

    /// @notice Maximum reputation score a user can achieve.
    uint256 public constant MAX_REPUTATION = 88_888;

    /// @notice Exponent applied to payout in reputation calculations.
    uint256 public constant PAYOUT_EXPONENT = 3;

    mapping(address => uint256) public reputation;
    mapping(address => uint256) private _entropy;
    mapping(address => bool) private blacklisted;
    mapping(address => bool) public callers;
    uint256 public premiumThreshold;
    IStakeManager public stakeManager;
    uint256 public stakeWeight = TOKEN_SCALE;
    uint256 public reputationWeight = TOKEN_SCALE;
    uint256 public validationRewardPercentage = DEFAULT_VALIDATION_REWARD_PERCENTAGE;
    address public pauser;
    address public pauserManager;

    event ReputationUpdated(address indexed user, int256 delta, uint256 newScore);
    event EntropyUpdated(address indexed user, uint256 newEntropy);
    event BlacklistUpdated(address indexed user, bool status);
    event CallerUpdated(address indexed caller, bool allowed);
    event PremiumThresholdUpdated(uint256 newThreshold);
    event StakeManagerUpdated(address stakeManager);
    event ScoringWeightsUpdated(uint256 stakeWeight, uint256 reputationWeight);
    event ModulesUpdated(address indexed stakeManager);
    event ValidationRewardPercentageUpdated(uint256 percentage);
    event PauserUpdated(address indexed pauser);
    event PauserManagerUpdated(address indexed pauserManager);

    error ArrayLengthMismatch();
    error ScoringPayoutTooLarge(uint256 payout);

    /// @notice Maximum canonical payout: uint128 reward at the 200% payout cap.
    uint256 public constant MAX_SCORING_PAYOUT = uint256(type(uint128).max) * 2;

    uint16 public failurePenaltyBps = 1000;
    uint32 public failurePenaltyCap = 10;
    mapping(address => bool) public jobRegistries;

    struct JobAccounting {
        address agent;
        uint40 createdAt;
        uint40 assignedAt;
        uint40 submittedAt;
        uint16 penaltyBps;
        uint32 penaltyCap;
        uint32 maximumDebit;
        uint8 validatorRewardPct;
        bool exists;
        bool assigned;
        bool submitted;
        bool settled;
        bool success;
        bool attributed;
        bool roundRecorded;
        uint32 actualAgentGain;
        uint256 roundId;
        uint256 validatorCount;
    }

    /// @dev One storage word per immutable participant. Claims never delete facts.
    struct ValidatorFact {
        address validator;
        bool revealed;
        bool vote;
    }

    mapping(bytes32 => JobAccounting) private _jobAccounting;
    mapping(bytes32 => mapping(uint256 => ValidatorFact)) private _validatorFacts;
    mapping(bytes32 => mapping(uint256 => uint256)) private _accountedValidators;

    error InvalidTerminalRegistry();
    error InvalidFailurePenalty();
    error InvalidJobAccountingState();
    error InvalidRound();
    error ValidatorAlreadyAccounted();
    event JobRegistryAuthorizationUpdated(address indexed registry, bool allowed);
    event FailurePenaltyPolicyUpdated(uint256 basisPoints, uint256 maximumPoints);
    event JobPolicySnapshotted(address indexed registry, uint256 indexed jobId, uint256 penaltyBps, uint256 penaltyCap, uint256 validatorRewardPct);
    event AssignmentScoreSnapshotted(address indexed registry, uint256 indexed jobId, address indexed agent, uint256 score, uint256 maximumDebit);
    event SubmissionTimeRecorded(address indexed registry, uint256 indexed jobId, uint256 submittedAt);
    event RoundFactsRecorded(address indexed registry, uint256 indexed jobId, uint256 roundId, uint256 validatorCount);
    event JobReputationFinalized(address indexed registry, uint256 indexed jobId, address indexed agent, bool success, bool attributed, uint256 credited, uint256 debited);
    event ValidatorReputationAccounted(address indexed registry, uint256 indexed jobId, uint256 indexed index, address validator, uint256 credited, uint256 debited);

    modifier onlyJobRegistry() {
        if (!jobRegistries[msg.sender]) revert InvalidTerminalRegistry();
        _;
    }

    function setJobRegistry(address registry, bool allowed) external onlyOwner {
        if (allowed && (registry.code.length == 0 || ITerminalJobRegistry(registry).terminalPolicyId() != terminalPolicyId)) {
            revert InvalidTerminalRegistry();
        }
        jobRegistries[registry] = allowed;
        emit JobRegistryAuthorizationUpdated(registry, allowed);
    }

    function setFailurePenaltyPolicy(uint256 basisPoints, uint256 maximumPoints) external onlyOwner {
        if (basisPoints > 10_000 || maximumPoints > MAX_REPUTATION) revert InvalidFailurePenalty();
        failurePenaltyBps = uint16(basisPoints);
        failurePenaltyCap = uint32(maximumPoints);
        emit FailurePenaltyPolicyUpdated(basisPoints, maximumPoints);
    }

    function jobKey(address registry, uint256 jobId) public pure returns (bytes32) {
        return keccak256(abi.encode(registry, jobId));
    }

    function jobAccounting(address registry, uint256 jobId) external view returns (JobAccounting memory) {
        return _jobAccounting[jobKey(registry, jobId)];
    }

    function validatorFact(address registry, uint256 jobId, uint256 index) external view returns (ValidatorFact memory) {
        return _validatorFacts[jobKey(registry, jobId)][index];
    }

    function validatorAccounted(address registry, uint256 jobId, uint256 index) public view returns (bool) {
        return (_accountedValidators[jobKey(registry, jobId)][index >> 8] & (uint256(1) << (index & 255))) != 0;
    }

    function registerJob(uint256 jobId) external onlyJobRegistry whenNotPaused {
        if (ITerminalJobRegistry(msg.sender).jobReputationEngine(jobId) != address(this)) revert InvalidTerminalRegistry();
        JobAccounting storage account = _jobAccounting[jobKey(msg.sender, jobId)];
        if (account.exists) revert InvalidJobAccountingState();
        account.exists = true;
        account.createdAt = uint40(block.timestamp);
        account.penaltyBps = failurePenaltyBps;
        account.penaltyCap = failurePenaltyCap;
        account.validatorRewardPct = uint8(validationRewardPercentage);
        emit JobPolicySnapshotted(msg.sender, jobId, failurePenaltyBps, failurePenaltyCap, validationRewardPercentage);
    }

    function assignJob(uint256 jobId, address agent) external onlyJobRegistry whenNotPaused {
        JobAccounting storage account = _jobAccounting[jobKey(msg.sender, jobId)];
        if (!account.exists || account.assigned || account.settled || agent == address(0)) revert InvalidJobAccountingState();
        account.agent = agent;
        account.assigned = true;
        account.assignedAt = uint40(block.timestamp);
        uint256 score = reputation[agent];
        uint256 debit = Math.mulDiv(score, account.penaltyBps, 10_000, Math.Rounding.Ceil);
        if (debit > account.penaltyCap) debit = account.penaltyCap;
        account.maximumDebit = uint32(debit);
        emit AssignmentScoreSnapshotted(msg.sender, jobId, agent, score, debit);
    }

    function submitJob(uint256 jobId) external onlyJobRegistry whenNotPaused {
        JobAccounting storage account = _jobAccounting[jobKey(msg.sender, jobId)];
        if (!account.assigned || account.submitted || account.settled) revert InvalidJobAccountingState();
        account.submitted = true;
        account.submittedAt = uint40(block.timestamp);
        emit SubmissionTimeRecorded(msg.sender, jobId, block.timestamp);
    }

    /// @notice Snapshot the actual completed committee; later size limits do not truncate it.
    /// @dev Closure work remains linear in the selected committee, as validation already is.
    function recordRound(
        address registry, uint256 jobId, uint256 roundId,
        address[] calldata validators, bool[] calldata revealed, bool[] calldata votes, bool penalizeNonReveal
    ) external whenNotPaused {
        if (!jobRegistries[registry] || msg.sender != ITerminalJobRegistry(registry).validationModule()) revert InvalidTerminalRegistry();
        bytes32 key = jobKey(registry, jobId);
        JobAccounting storage account = _jobAccounting[key];
        uint256 count = validators.length;
        if (!account.submitted || account.settled || account.roundRecorded || roundId == 0) revert InvalidRound();
        if (count != revealed.length || count != votes.length) revert ArrayLengthMismatch();
        account.roundRecorded = true;
        account.roundId = roundId;
        account.validatorCount = count;
        for (uint256 i; i < count; ++i) {
            address validator = validators[i];
            if (validator == address(0)) revert InvalidRound();
            _validatorFacts[key][i] = ValidatorFact(validator, revealed[i], votes[i]);
            // Objective non-reveal uses the existing administrative penalty semantics.
            if (!revealed[i] && penalizeNonReveal) _decreaseReputation(validator, 1);
        }
        emit RoundFactsRecorded(registry, jobId, roundId, count);
    }

    /// @notice Account for the final agent outcome once; no validator claim is required.
    function finalizeJob(uint256 jobId, address agent, bool success, bool attributed, uint256 payout)
        external onlyJobRegistry whenNotPaused returns (uint256 actualGain)
    {
        JobAccounting storage account = _jobAccounting[jobKey(msg.sender, jobId)];
        if (!account.exists || account.settled || agent != account.agent) revert InvalidJobAccountingState();
        if (success && (!account.submitted || !account.assigned)) revert InvalidJobAccountingState();
        if ((!success && payout != 0) || (attributed && !account.assigned)) revert InvalidJobAccountingState();
        account.settled = true;
        account.success = success;
        account.attributed = attributed;
        uint256 debited;
        if (success) {
            actualGain = _increaseReputation(agent, calculateReputationPoints(payout, 0));
            account.actualAgentGain = uint32(actualGain);
        } else if (attributed) {
            debited = _decreaseWithoutBlacklist(agent, account.maximumDebit);
        }
        emit JobReputationFinalized(msg.sender, jobId, agent, success, attributed, actualGain, debited);
    }

    /// @notice Permissionlessly process one immutable validator fact after settlement.
    /// @dev No expiry and no claim-completion dependency on agent payout. Each call is O(1).
    function accountValidator(address registry, uint256 jobId, uint256 index) external whenNotPaused {
        bytes32 key = jobKey(registry, jobId);
        JobAccounting storage account = _jobAccounting[key];
        if (!account.settled || index >= account.validatorCount) revert InvalidJobAccountingState();
        uint256 mask = uint256(1) << (index & 255);
        uint256 word = index >> 8;
        if ((_accountedValidators[key][word] & mask) != 0) revert ValidatorAlreadyAccounted();
        _accountedValidators[key][word] |= mask;
        ValidatorFact storage fact = _validatorFacts[key][index];
        uint256 credited;
        uint256 debited;
        if (fact.revealed) {
            if (account.success && fact.vote) {
                uint256 points = Math.mulDiv(account.actualAgentGain, account.validatorRewardPct, PERCENTAGE_SCALE);
                credited = _increaseReputation(fact.validator, points);
            } else if (account.attributed && fact.vote != account.success) {
                // Protocol-outcome disagreement is not proof of dishonesty.
                debited = _decreaseWithoutBlacklist(fact.validator, 1);
            }
        }
        emit ValidatorReputationAccounted(registry, jobId, index, fact.validator, credited, debited);
    }

    function _decreaseWithoutBlacklist(address user, uint256 maximum) internal returns (uint256 debit) {
        uint256 current = reputation[user];
        debit = maximum < current ? maximum : current;
        reputation[user] = current - debit;
        emit ReputationUpdated(user, -int256(debit), current - debit);
    }

    modifier onlyOwnerOrPauser() {
        require(
            msg.sender == owner() || msg.sender == pauser,
            "owner or pauser only"
        );
        _;
    }

    function setPauser(address _pauser) external {
        if (msg.sender != owner() && msg.sender != pauserManager) {
            revert NotOwnerOrPauserManager();
        }
        pauser = _pauser;
        emit PauserUpdated(_pauser);
    }

    function setPauserManager(address manager) external onlyOwner {
        pauserManager = manager;
        emit PauserManagerUpdated(manager);
    }
    constructor(IStakeManager _stakeManager) Ownable(msg.sender) {
        require(address(_stakeManager) != address(0), "invalid stake manager");
        require(_stakeManager.version() == 2, "incompatible version");
        stakeManager = _stakeManager;
        emit StakeManagerUpdated(address(_stakeManager));
        emit ModulesUpdated(address(_stakeManager));
    }

    modifier onlyCaller() {
        require(callers[msg.sender], "not authorized");
        _;
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Authorize or revoke a caller.
    function setCaller(address caller, bool allowed) public onlyOwner {
        callers[caller] = allowed;
        emit CallerUpdated(caller, allowed);
    }

    /// @notice Backwards compatible alias for {setCaller}.
    function setAuthorizedCaller(address caller, bool allowed) external onlyOwner {
        setCaller(caller, allowed);
    }

    /// @notice Set the StakeManager used for stake lookups.
    function setStakeManager(IStakeManager manager) external onlyOwner {
        require(address(manager) != address(0), "invalid stake manager");
        require(manager.version() == 2, "incompatible version");
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
        emit ModulesUpdated(address(manager));
    }

    /// @notice Configure weighting factors for stake and reputation.
    /// @param stakeW Weight applied to stake (scaled by TOKEN_SCALE)
    /// @param repW Weight applied to reputation (scaled by TOKEN_SCALE)
    function setScoringWeights(uint256 stakeW, uint256 repW) external onlyOwner {
        stakeWeight = stakeW;
        reputationWeight = repW;
        emit ScoringWeightsUpdated(stakeW, repW);
    }

    /// @notice Set percentage of agent gain given to validators.
    function setValidationRewardPercentage(uint256 percentage) external onlyOwner {
        require(percentage <= PERCENTAGE_SCALE, "invalid percentage");
        validationRewardPercentage = percentage;
        emit ValidationRewardPercentageUpdated(percentage);
    }

    /// @notice Set reputation threshold for premium access.
    function setPremiumThreshold(uint256 newThreshold) public onlyOwner {
        premiumThreshold = newThreshold;
        emit PremiumThresholdUpdated(newThreshold);
    }

    /// @notice Backwards compatible threshold setter.
    function setThreshold(uint256 newThreshold) external onlyOwner {
        setPremiumThreshold(newThreshold);
    }

    /// @notice Update blacklist status for a user.
    function setBlacklist(address user, bool status) public onlyOwner {
        blacklisted[user] = status;
        emit BlacklistUpdated(user, status);
    }

    /// @notice Backwards compatible blacklist setter.
    function blacklist(address user, bool status) external onlyOwner {
        setBlacklist(user, status);
    }

    /// @notice Increase reputation for a user.
    /// @dev Blacklisted users may gain reputation to clear their status.
    function add(address user, uint256 amount) external onlyCaller whenNotPaused {
        _increaseReputation(user, amount);
    }

    /// @notice Decrease reputation for a user.
    function subtract(address user, uint256 amount) external onlyCaller whenNotPaused {
        _decreaseReputation(user, amount);
    }

    /// @notice Adjust reputation by a signed delta.
    /// @dev Negative values reduce reputation and may trigger blacklisting.
    ///      Positive values increase reputation with diminishing returns and
    ///      may clear an existing blacklist if the new score meets the
    ///      premium threshold.
    /// @param user The account whose reputation is modified.
    /// @param delta Signed change to apply.
    function update(address user, int256 delta) external override onlyCaller whenNotPaused {
        if (delta > 0) {
            _increaseReputation(user, uint256(delta));
        } else if (delta < 0) {
            uint256 amount = uint256(-delta);
            _decreaseReputation(user, amount);
            _entropy[user] += amount;
            emit EntropyUpdated(user, _entropy[user]);
        }
    }

    /// @notice Internal helper to increase reputation and handle blacklist logic.
    function _increaseReputation(address user, uint256 amount) internal returns (uint256 delta) {
        uint256 current = reputation[user];
        uint256 newScore = _enforceReputationGrowth(current, amount);
        delta = newScore - current;
        reputation[user] = newScore;
        emit ReputationUpdated(user, int256(delta), newScore);
        if (blacklisted[user] && newScore >= premiumThreshold) {
            blacklisted[user] = false;
            emit BlacklistUpdated(user, false);
        }
    }

    /// @notice Internal helper to decrease reputation and manage blacklists.
    function _decreaseReputation(address user, uint256 amount) internal {
        uint256 current = reputation[user];
        uint256 newScore = current > amount ? current - amount : 0;
        reputation[user] = newScore;
        uint256 delta = current - newScore;
        emit ReputationUpdated(user, -int256(delta), newScore);
        if (!blacklisted[user] && newScore < premiumThreshold) {
            blacklisted[user] = true;
            emit BlacklistUpdated(user, true);
        }
    }

    function getReputation(address user) external view returns (uint256) {
        return reputation[user];
    }

    /// @notice Alias for {reputation}.
    function reputationOf(address user) external view returns (uint256) {
        return reputation[user];
    }

    /// @notice Retrieve accumulated entropy penalties for a user.
    function entropy(address user) public view returns (uint256) {
        return _entropy[user];
    }

    /// @notice Alias for {entropy}.
    function getEntropy(address user) external view returns (uint256) {
        return _entropy[user];
    }

    /// @notice Backwards compatible view for legacy naming.
    function entropyOf(address user) external view returns (uint256) {
        return _entropy[user];
    }

    /// @notice Expose blacklist status for a user.
    function isBlacklisted(address user) external view returns (bool) {
        return blacklisted[user];
    }

    /// @notice Determine whether a user meets the premium access threshold.
    function meetsThreshold(address user) external view returns (bool) {
        return reputation[user] >= premiumThreshold;
    }

    /// @notice Backwards compatible view for legacy naming.
    function canAccessPremium(address user) external view returns (bool) {
        return reputation[user] >= premiumThreshold;
    }

    // ---------------------------------------------------------------------
    // Job lifecycle hooks
    // ---------------------------------------------------------------------

    /// @notice Ensure an applicant meets premium requirements and is not blacklisted.
    function onApply(address user) external view onlyCaller whenNotPaused {
        require(!blacklisted[user], "Blacklisted agent");
        require(reputation[user] >= premiumThreshold, "insufficient reputation");
    }

    error LegacyReputationLifecycleUnsupported();

    /// @notice Legacy unkeyed lifecycle hooks cannot provide exactly-once accounting.
    function onFinalize(address, bool, uint256, uint256) external pure {
        revert LegacyReputationLifecycleUnsupported();
    }

    function rewardValidator(address, uint256) external pure {
        revert LegacyReputationLifecycleUnsupported();
    }

    function updateScores(
        uint256, address, address[] calldata, bool, bool[] calldata,
        bool[] calldata, uint256, uint256
    ) external pure {
        revert LegacyReputationLifecycleUnsupported();
    }

    /// @notice Compute payout-only reputation points in 18-decimal token units.
    /// @dev The legacy duration argument is retained for ABI compatibility but earns no points.
    function calculateReputationPoints(uint256 payout, uint256) public pure returns (uint256) {
        if (payout > MAX_SCORING_PAYOUT) revert ScoringPayoutTooLarge(payout);
        // Convert the 18-decimal payout into whole tokens so subsequent math
        // remains independent of token precision.
        uint256 scaledPayout = payout / TOKEN_SCALE;
        uint256 payoutPoints = (scaledPayout ** PAYOUT_EXPONENT) / PAYOUT_SCALE;
        return log2(1 + payoutPoints * LOG_FACTOR);
    }

    /// @notice Compute validator reputation gain from agent gain.
    function calculateValidatorReputationPoints(uint256 agentReputationGain) public view returns (uint256) {
        return Math.mulDiv(agentReputationGain, validationRewardPercentage, PERCENTAGE_SCALE);
    }

    /// @notice Log base 2 implementation from v1.
    function log2(uint256 x) public pure returns (uint256 y) {
        assembly {
            let arg := x
            x := sub(x, 1)
            x := or(x, div(x, 0x02))
            x := or(x, div(x, 0x04))
            x := or(x, div(x, 0x10))
            x := or(x, div(x, 0x100))
            x := or(x, div(x, 0x10000))
            x := or(x, div(x, 0x100000000))
            x := or(x, div(x, 0x10000000000000000))
            x := or(x, div(x, 0x100000000000000000000000000000000))
            x := add(x, 1)
            y := 0
            for { let shift := 128 } gt(shift, 0) { shift := div(shift, 2) } {
                let temp := shr(shift, x)
                if gt(temp, 0) {
                    x := temp
                    y := add(y, shift)
                }
            }
        }
    }

    /// @notice Attenuate only the incoming increment, floor-round, and cap growth.
    /// @dev Zero/tiny gains may round to zero. Existing score is never reduced.
    function _enforceReputationGrowth(uint256 current, uint256 points) internal pure returns (uint256) {
        if (points == 0 || current >= MAX_REPUTATION) return current;
        uint256 squaredCap = MAX_REPUTATION * MAX_REPUTATION;
        uint256 gain = Math.mulDiv(points, squaredCap, squaredCap + current * current);
        uint256 remaining = MAX_REPUTATION - current;
        if (gain > remaining) gain = remaining;
        return current + gain;
    }

    /// @notice Return the combined operator score based on stake and reputation.
    /// @dev Blacklisted users score 0.
    function getOperatorScore(address operator) external view returns (uint256) {
        if (blacklisted[operator]) return 0;
        uint256 stake;
        if (address(stakeManager) != address(0)) {
            stake = stakeManager.stakeOf(operator, IStakeManager.Role.Agent);
        }
        uint256 rep = reputation[operator];
        return ((stake * stakeWeight) + (rep * reputationWeight)) / TOKEN_SCALE;
    }

    /// @notice Return the protocol tax-policy compatibility flag.
    /// @return Always true; this is not a determination of legal tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    function pause() external onlyOwnerOrPauser {
        _pause();
    }

    function unpause() external onlyOwnerOrPauser {
        _unpause();
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("ReputationEngine: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("ReputationEngine: no ether");
    }
}

