// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TrustlessEconomicCoreDemo
/// @notice Demonstrates a milestone-based escrow with validator incentives,
/// slashing, ENS-style identity gating, and system-wide emergency controls.
/// @dev This contract is intentionally opinionated for demo purposes and does
/// not attempt to be a drop-in replacement for the production modules. All
/// percentages are expressed in basis points (1e4 = 100%).
interface IBurnableToken {
    function burn(uint256 amount) external;
}

contract TrustlessEconomicCoreDemo is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BASIS_POINTS = 10_000;

    struct Milestone {
        uint256 amount;
        uint256 approvals;
        bool released;
        address[] approvers;
    }

    struct Job {
        address employer;
        address agent;
        uint256 budget;
        uint256 lockedStake;
        uint256 currentMilestone;
        uint64 approvalThreshold;
        bool completed;
        bool cancelled;
        bool exists;
    }

    IERC20 public immutable token;
    address public treasury;

    uint256 public validatorRewardPct; // portion of milestone reward distributed to validators
    uint256 public protocolFeePct; // portion routed to treasury
    uint256 public burnPct; // portion burned at milestone release

    uint256 public minAgentStake;
    uint256 public jobStakeLockPct; // portion of total milestone budget locked from the agent stake

    uint256 public slashEmployerPct;
    uint256 public slashValidatorPct;
    uint256 public slashTreasuryPct;
    uint256 public slashBurnPct;

    uint256 public nextJobId = 1;

    mapping(uint256 => Job) public jobs;
    mapping(uint256 => Milestone[]) private _milestones;
    mapping(uint256 => address[]) private _validatorCommittees;
    mapping(uint256 => mapping(address => bool)) public isJobValidator;
    mapping(address => bytes32) public agentEnsNode;
    mapping(address => bytes32) public validatorEnsNode;

    mapping(address => uint256) public agentStake;
    mapping(address => uint256) public agentLockedStake;

    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasApproved;

    event TreasuryUpdated(address indexed newTreasury);
    event PercentagesUpdated(uint256 validatorRewardPct, uint256 protocolFeePct, uint256 burnPct);
    event SlashPolicyUpdated(
        uint256 employerPct,
        uint256 validatorPct,
        uint256 treasuryPct,
        uint256 burnPct
    );
    event StakeParametersUpdated(uint256 minStake, uint256 jobStakeLockPct);
    event AgentIdentityRegistered(address indexed agent, bytes32 ensNode);
    event ValidatorIdentityRegistered(address indexed validator, bytes32 ensNode);
    event StakeDeposited(address indexed agent, uint256 amount);
    event StakeWithdrawn(address indexed agent, uint256 amount);
    event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256[] milestones, address[] committee, uint64 threshold, uint256 lockedStake);
    event JobPaused(uint256 indexed jobId);
    event JobResumed(uint256 indexed jobId);
    event JobCancelled(uint256 indexed jobId);
    event MilestoneApproved(uint256 indexed jobId, uint256 indexed milestoneId, address indexed validator, uint256 approvals, uint64 threshold);
    event MilestoneReleased(uint256 indexed jobId, uint256 indexed milestoneId, uint256 agentAmount, uint256 validatorAmount, uint256 feeAmount, uint256 burnAmount);
    event JobCompleted(uint256 indexed jobId);
    event AgentSlashed(
        uint256 indexed jobId,
        address indexed agent,
        uint256 amount,
        uint256 employerShare,
        uint256 validatorShare,
        uint256 treasuryShare,
        uint256 burnShare
    );

    error InvalidAddress();
    error InvalidPercentages();
    error NotRegisteredAgent();
    error NotRegisteredValidator();
    error InsufficientStake(uint256 required, uint256 actual);
    error UnknownJob();
    error InvalidCommittee();
    error ThresholdTooHigh();
    error InvalidMilestone();
    error AlreadyReleased();
    error AlreadyApproved();
    error NotValidator();
    error JobNotActive();
    error JobPausedOrCancelled();
    error StakeLocked(uint256 locked);
    error NothingToWithdraw();
    error SlashTooHigh(uint256 requested, uint256 locked);

    constructor(
        IERC20 token_,
        address treasury_,
        uint256 validatorRewardPct_,
        uint256 protocolFeePct_,
        uint256 burnPct_,
        uint256 minAgentStake_,
        uint256 jobStakeLockPct_
    ) Ownable(msg.sender) {
        if (address(token_) == address(0) || treasury_ == address(0)) {
            revert InvalidAddress();
        }
        token = token_;
        treasury = treasury_;
        _setPercentages(validatorRewardPct_, protocolFeePct_, burnPct_);
        _setStakeParameters(minAgentStake_, jobStakeLockPct_);
        _setSlashPolicy(5000, 2000, 2000, 1000);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setPercentages(
        uint256 validatorRewardPct_,
        uint256 protocolFeePct_,
        uint256 burnPct_
    ) external onlyOwner {
        _setPercentages(validatorRewardPct_, protocolFeePct_, burnPct_);
    }

    function _setPercentages(
        uint256 validatorRewardPct_,
        uint256 protocolFeePct_,
        uint256 burnPct_
    ) private {
        if (validatorRewardPct_ + protocolFeePct_ + burnPct_ > BASIS_POINTS) {
            revert InvalidPercentages();
        }
        validatorRewardPct = validatorRewardPct_;
        protocolFeePct = protocolFeePct_;
        burnPct = burnPct_;
        emit PercentagesUpdated(validatorRewardPct_, protocolFeePct_, burnPct_);
    }

    function setStakeParameters(uint256 minStake, uint256 jobStakeLockPct_) external onlyOwner {
        _setStakeParameters(minStake, jobStakeLockPct_);
    }

    function _setStakeParameters(uint256 minStake, uint256 jobStakeLockPct_) private {
        if (jobStakeLockPct_ > BASIS_POINTS) revert InvalidPercentages();
        minAgentStake = minStake;
        jobStakeLockPct = jobStakeLockPct_;
        emit StakeParametersUpdated(minStake, jobStakeLockPct_);
    }

    function setSlashPolicy(
        uint256 employerPct,
        uint256 validatorPct,
        uint256 treasuryPct,
        uint256 burnPct_
    ) external onlyOwner {
        _setSlashPolicy(employerPct, validatorPct, treasuryPct, burnPct_);
    }

    function _setSlashPolicy(
        uint256 employerPct,
        uint256 validatorPct,
        uint256 treasuryPct,
        uint256 burnPct_
    ) private {
        if (employerPct + validatorPct + treasuryPct + burnPct_ != BASIS_POINTS) {
            revert InvalidPercentages();
        }
        slashEmployerPct = employerPct;
        slashValidatorPct = validatorPct;
        slashTreasuryPct = treasuryPct;
        slashBurnPct = burnPct_;
        emit SlashPolicyUpdated(employerPct, validatorPct, treasuryPct, burnPct_);
    }

    function registerAgentIdentity(address agent, bytes32 ensNode) external onlyOwner {
        if (agent == address(0) || ensNode == bytes32(0)) revert InvalidAddress();
        agentEnsNode[agent] = ensNode;
        emit AgentIdentityRegistered(agent, ensNode);
    }

    function registerValidatorIdentity(address validator, bytes32 ensNode) external onlyOwner {
        if (validator == address(0) || ensNode == bytes32(0)) revert InvalidAddress();
        validatorEnsNode[validator] = ensNode;
        emit ValidatorIdentityRegistered(validator, ensNode);
    }

    function depositStake(uint256 amount) external whenNotPaused {
        if (agentEnsNode[msg.sender] == bytes32(0)) revert NotRegisteredAgent();
        agentStake[msg.sender] += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (agentStake[msg.sender] < minAgentStake) {
            revert InsufficientStake(minAgentStake, agentStake[msg.sender]);
        }
        emit StakeDeposited(msg.sender, amount);
    }

    function withdrawStake(uint256 amount) external whenNotPaused {
        uint256 available = agentStake[msg.sender] - agentLockedStake[msg.sender];
        if (available < amount) revert StakeLocked(agentLockedStake[msg.sender]);
        if (amount == 0) revert NothingToWithdraw();
        agentStake[msg.sender] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, amount);
    }

    function createJob(
        address agent,
        uint256[] calldata milestoneAmounts,
        address[] calldata committee,
        uint64 threshold
    ) external whenNotPaused nonReentrant returns (uint256 jobId) {
        if (agentEnsNode[agent] == bytes32(0)) revert NotRegisteredAgent();
        if (milestoneAmounts.length == 0) revert InvalidMilestone();
        if (committee.length == 0) revert InvalidCommittee();
        if (threshold == 0 || threshold > committee.length) revert ThresholdTooHigh();

        uint256 total;
        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            if (milestoneAmounts[i] == 0) revert InvalidMilestone();
            total += milestoneAmounts[i];
        }

        uint256 requiredStake = (total * jobStakeLockPct) / BASIS_POINTS;
        if (agentStake[agent] < minAgentStake || agentStake[agent] - agentLockedStake[agent] < requiredStake) {
            revert InsufficientStake(requiredStake, agentStake[agent] - agentLockedStake[agent]);
        }

        token.safeTransferFrom(msg.sender, address(this), total);

        jobId = nextJobId++;
        Job storage job = jobs[jobId];
        job.employer = msg.sender;
        job.agent = agent;
        job.budget = total;
        job.lockedStake = requiredStake;
        job.approvalThreshold = threshold;
        job.exists = true;

        agentLockedStake[agent] += requiredStake;

        address[] storage validatorSet = _validatorCommittees[jobId];
        for (uint256 i = 0; i < committee.length; i++) {
            address validator = committee[i];
            if (validatorEnsNode[validator] == bytes32(0)) revert NotRegisteredValidator();
            if (isJobValidator[jobId][validator]) revert InvalidCommittee();
            validatorSet.push(validator);
            isJobValidator[jobId][validator] = true;
        }

        Milestone[] storage milestones = _milestones[jobId];
        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            milestones.push();
            Milestone storage m = milestones[i];
            m.amount = milestoneAmounts[i];
        }

        emit JobCreated(jobId, msg.sender, agent, milestoneAmounts, committee, threshold, requiredStake);
    }

    function getMilestones(uint256 jobId) external view returns (Milestone[] memory) {
        return _milestones[jobId];
    }

    function getCommittee(uint256 jobId) external view returns (address[] memory) {
        return _validatorCommittees[jobId];
    }

    function pauseJob(uint256 jobId) external onlyOwner {
        Job storage job = jobs[jobId];
        if (!job.exists) revert UnknownJob();
        job.cancelled = true;
        emit JobPaused(jobId);
    }

    function resumeJob(uint256 jobId) external onlyOwner {
        Job storage job = jobs[jobId];
        if (!job.exists) revert UnknownJob();
        job.cancelled = false;
        emit JobResumed(jobId);
    }

    function cancelJob(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (!job.exists) revert UnknownJob();
        if (msg.sender != job.employer) revert JobNotActive();
        if (job.completed || job.cancelled) revert JobNotActive();

        uint256 refund = _clearRemainingMilestones(jobId);
        job.cancelled = true;
        job.completed = true;

        if (refund > 0) {
            token.safeTransfer(job.employer, refund);
        }

        _unlockStake(jobId);
        emit JobCancelled(jobId);
    }

    function approveMilestone(uint256 jobId, uint256 milestoneId) external whenNotPaused nonReentrant {
        Job storage job = jobs[jobId];
        if (!job.exists) revert UnknownJob();
        if (job.cancelled || job.completed) revert JobPausedOrCancelled();
        if (!isJobValidator[jobId][msg.sender]) revert NotValidator();

        Milestone storage milestone = _milestones[jobId][milestoneId];
        if (milestone.amount == 0) revert InvalidMilestone();
        if (milestone.released) revert AlreadyReleased();
        if (milestoneId != job.currentMilestone) revert InvalidMilestone();
        if (hasApproved[jobId][milestoneId][msg.sender]) revert AlreadyApproved();

        hasApproved[jobId][milestoneId][msg.sender] = true;
        milestone.approvers.push(msg.sender);
        milestone.approvals += 1;
        emit MilestoneApproved(jobId, milestoneId, msg.sender, milestone.approvals, job.approvalThreshold);

        if (milestone.approvals >= job.approvalThreshold) {
            _releaseMilestone(jobId, milestoneId);
        }
    }

    function _releaseMilestone(uint256 jobId, uint256 milestoneId) private {
        Job storage job = jobs[jobId];
        Milestone storage milestone = _milestones[jobId][milestoneId];
        milestone.released = true;

        uint256 amount = milestone.amount;
        uint256 validatorAmount = (amount * validatorRewardPct) / BASIS_POINTS;
        uint256 feeAmount = (amount * protocolFeePct) / BASIS_POINTS;
        uint256 burnAmount = (amount * burnPct) / BASIS_POINTS;
        uint256 agentAmount = amount - validatorAmount - feeAmount - burnAmount;

        if (validatorAmount > 0) {
            address[] storage approvers = milestone.approvers;
            uint256 perValidator = validatorAmount / approvers.length;
            for (uint256 i = 0; i < approvers.length; i++) {
                token.safeTransfer(approvers[i], perValidator);
            }
            uint256 remainder = validatorAmount - (perValidator * approvers.length);
            if (remainder > 0) {
                token.safeTransfer(treasury, remainder);
            }
        }

        if (feeAmount > 0) {
            token.safeTransfer(treasury, feeAmount);
        }
        if (burnAmount > 0) {
            IBurnableToken(address(token)).burn(burnAmount);
        }

        token.safeTransfer(job.agent, agentAmount);

        job.currentMilestone += 1;
        if (job.currentMilestone == _milestones[jobId].length) {
            job.completed = true;
            _unlockStake(jobId);
            emit JobCompleted(jobId);
        }

        emit MilestoneReleased(jobId, milestoneId, agentAmount, validatorAmount, feeAmount, burnAmount);
    }

    function slashAgent(uint256 jobId, uint256 amount) external onlyOwner nonReentrant {
        Job storage job = jobs[jobId];
        if (!job.exists) revert UnknownJob();
        if (amount == 0) revert InvalidMilestone();
        if (amount > job.lockedStake) revert SlashTooHigh(amount, job.lockedStake);

        job.lockedStake -= amount;
        agentLockedStake[job.agent] -= amount;
        agentStake[job.agent] -= amount;

        uint256 employerShare = (amount * slashEmployerPct) / BASIS_POINTS;
        uint256 validatorShare = (amount * slashValidatorPct) / BASIS_POINTS;
        uint256 treasuryShare = (amount * slashTreasuryPct) / BASIS_POINTS;
        uint256 burnShare = amount - employerShare - validatorShare - treasuryShare;

        if (employerShare > 0) token.safeTransfer(job.employer, employerShare);

        if (validatorShare > 0) {
            address[] storage committee = _validatorCommittees[jobId];
            uint256 perValidator = validatorShare / committee.length;
            for (uint256 i = 0; i < committee.length; i++) {
                token.safeTransfer(committee[i], perValidator);
            }
            uint256 remainder = validatorShare - (perValidator * committee.length);
            if (remainder > 0) token.safeTransfer(treasury, remainder);
        }

        if (treasuryShare > 0) token.safeTransfer(treasury, treasuryShare);
        if (burnShare > 0) IBurnableToken(address(token)).burn(burnShare);

        emit AgentSlashed(jobId, job.agent, amount, employerShare, validatorShare, treasuryShare, burnShare);
    }

    function _unlockStake(uint256 jobId) private {
        Job storage job = jobs[jobId];
        uint256 locked = job.lockedStake;
        if (locked > 0) {
            job.lockedStake = 0;
            agentLockedStake[job.agent] -= locked;
        }
    }

    function _remainingBudget(uint256 jobId) private view returns (uint256 remaining) {
        Milestone[] storage milestones = _milestones[jobId];
        for (uint256 i = 0; i < milestones.length; i++) {
            if (!milestones[i].released) {
                remaining += milestones[i].amount;
            }
        }
    }

    function _clearRemainingMilestones(uint256 jobId) private returns (uint256 refund) {
        Milestone[] storage milestones = _milestones[jobId];
        for (uint256 i = 0; i < milestones.length; i++) {
            Milestone storage milestone = milestones[i];
            if (!milestone.released && milestone.amount > 0) {
                refund += milestone.amount;
                milestone.amount = 0;
            }
        }
    }

    function pauseAll() external onlyOwner {
        _pause();
    }

    function unpauseAll() external onlyOwner {
        _unpause();
    }
}
