// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IERC20BurnableFrom is IERC20 {
    function burnFrom(address account, uint256 amount) external;
}

contract AGIJobManager is Ownable, Pausable, ReentrancyGuard {
    address public constant AGIALPHA_MAINNET = 0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA;

    error InvalidMainnetAGIALPHA(address provided);
    error AGIALPHATokenPinned();
    error InvalidBurnBps();
    error InvalidJob();
    error InvalidState();
    error UnauthorizedDisputeCaller();
    error AgentNotAssigned();
    error InsolventEscrowBalance();
    error InsufficientWithdrawableBalance(uint256 requested, uint256 available);
    error UseWithdrawAGIForSurplus();

    enum JobState {
        None,
        Open,
        Completed,
        Refunded,
        Cancelled,
        Delisted,
        Expired,
        Disputed,
        Resolved
    }

    struct Job {
        address employer;
        address agent;
        uint128 payout;
        uint64 deadline;
        uint16 employerBurnBpsSnapshot;
        JobState state;
    }

    IERC20BurnableFrom public immutable agiToken;
    uint16 public employerBurnBps;
    uint256 public nextJobId;
    uint256 public totalEscrowObligations;
    uint256 public totalLockedBondObligations;

    mapping(uint256 => Job) public jobs;

    event JobCreated(uint256 indexed jobId, address indexed employer, uint256 payout, uint256 burnAmount, uint256 totalRequired, uint64 deadline, string uri);
    event EmployerBurnChargedAtJobCreation(uint256 indexed jobId, address indexed employer, uint256 burnAmount);
    event JobCompleted(uint256 indexed jobId, address indexed agent, uint256 payout);
    event JobRefunded(uint256 indexed jobId, uint256 payout);
    event JobCancelled(uint256 indexed jobId, JobState state, uint256 payout);
    event JobDisputeResolved(uint256 indexed jobId, bool employerWins, uint256 employerAmount, uint256 agentAmount);
    event JobAgentAssigned(uint256 indexed jobId, address indexed agent);
    event AGISurplusWithdrawn(address indexed to, uint256 amount);
    event EmployerBurnBpsUpdated(uint16 oldBps, uint16 newBps);

    constructor(address agiTokenAddress, uint16 burnBps_, address initialOwner) Ownable(initialOwner) {
        if (block.chainid == 1 && agiTokenAddress != AGIALPHA_MAINNET) {
            revert InvalidMainnetAGIALPHA(agiTokenAddress);
        }
        if (burnBps_ > 10_000) revert InvalidBurnBps();
        agiToken = IERC20BurnableFrom(agiTokenAddress);
        employerBurnBps = burnBps_;
    }

    function updateAGITokenAddress(address) external pure {
        revert AGIALPHATokenPinned();
    }

    function setEmployerBurnBps(uint16 newBps) external onlyOwner {
        if (newBps > 10_000) revert InvalidBurnBps();
        emit EmployerBurnBpsUpdated(employerBurnBps, newBps);
        employerBurnBps = newBps;
    }

    function quoteCreateJobBurn(uint256 payout) public view returns (uint256) {
        return (payout * employerBurnBps) / 10_000;
    }

    function getCreateJobFundingRequirement(uint256 payout) public view returns (uint256) {
        return payout + quoteCreateJobBurn(payout);
    }

    function getCreateJobAllowanceRequirement(uint256 payout) external view returns (uint256) {
        return getCreateJobFundingRequirement(payout);
    }

    function getJobBurnAmountSnapshot(uint256 jobId) external view returns (uint256) {
        Job storage job = jobs[jobId];
        if (job.state == JobState.None) revert InvalidJob();
        return (uint256(job.payout) * uint256(job.employerBurnBpsSnapshot)) / 10_000;
    }

    function createJob(uint256 payout, uint64 deadline, string calldata uri) external whenNotPaused nonReentrant returns (uint256 jobId) {
        if (payout == 0 || deadline <= block.timestamp) revert InvalidJob();

        uint256 burnAmount = quoteCreateJobBurn(payout);
        uint256 totalRequired = payout + burnAmount;

        nextJobId++;
        jobId = nextJobId;
        jobs[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            payout: uint128(payout),
            deadline: deadline,
            employerBurnBpsSnapshot: employerBurnBps,
            state: JobState.Open
        });

        totalEscrowObligations += payout;

        // Atomic: if either transfer or burn fails, tx reverts and no job persists.
        require(agiToken.transferFrom(msg.sender, address(this), payout), "PAYOUT_TRANSFER_FAILED");
        if (burnAmount > 0) {
            agiToken.burnFrom(msg.sender, burnAmount);
            emit EmployerBurnChargedAtJobCreation(jobId, msg.sender, burnAmount);
        }

        emit JobCreated(jobId, msg.sender, payout, burnAmount, totalRequired, deadline, uri);
    }

    function completeJob(uint256 jobId, address agent) external whenNotPaused nonReentrant {
        Job storage job = jobs[jobId];
        if (job.state != JobState.Open || job.employer != msg.sender || agent == address(0)) revert InvalidState();

        job.state = JobState.Completed;
        job.agent = agent;
        totalEscrowObligations -= job.payout;
        require(agiToken.transfer(agent, job.payout), "PAYOUT_SEND_FAILED");
        emit JobCompleted(jobId, agent, job.payout);
    }

    function refundEmployer(uint256 jobId) external whenNotPaused nonReentrant {
        Job storage job = jobs[jobId];
        if (job.state != JobState.Open || job.employer != msg.sender) revert InvalidState();

        job.state = JobState.Refunded;
        totalEscrowObligations -= job.payout;
        require(agiToken.transfer(job.employer, job.payout), "REFUND_FAILED");
        emit JobRefunded(jobId, job.payout);
    }

    function cancelJob(uint256 jobId) external whenNotPaused nonReentrant {
        _cancel(jobId, JobState.Cancelled);
    }

    function delistJob(uint256 jobId) external onlyOwner whenNotPaused nonReentrant {
        _cancel(jobId, JobState.Delisted);
    }

    function expireJob(uint256 jobId) external whenNotPaused nonReentrant {
        Job storage job = jobs[jobId];
        if (job.state != JobState.Open || block.timestamp < job.deadline) revert InvalidState();
        _cancel(jobId, JobState.Expired);
    }

    function resolveDispute(uint256 jobId, bool employerWins) external onlyOwner whenNotPaused nonReentrant {
        Job storage job = jobs[jobId];
        if (job.state != JobState.Open && job.state != JobState.Disputed) revert InvalidState();
        job.state = JobState.Resolved;

        totalEscrowObligations -= job.payout;
        if (employerWins) {
            require(agiToken.transfer(job.employer, job.payout), "DISPUTE_REFUND_FAILED");
            emit JobDisputeResolved(jobId, true, job.payout, 0);
        } else {
            address payee = job.agent;
            if (payee == address(0)) revert AgentNotAssigned();
            require(agiToken.transfer(payee, job.payout), "DISPUTE_PAYOUT_FAILED");
            emit JobDisputeResolved(jobId, false, 0, job.payout);
        }
    }

    function assignAgent(uint256 jobId, address agent) external whenNotPaused {
        Job storage job = jobs[jobId];
        if (job.state != JobState.Open || job.employer != msg.sender || agent == address(0)) revert InvalidState();
        job.agent = agent;
        emit JobAgentAssigned(jobId, agent);
    }

    function markDisputed(uint256 jobId) external whenNotPaused {
        Job storage job = jobs[jobId];
        if (job.state != JobState.Open) revert InvalidState();
        if (msg.sender != owner() && msg.sender != job.employer && msg.sender != job.agent) {
            revert UnauthorizedDisputeCaller();
        }
        job.state = JobState.Disputed;
    }

    function withdrawableAGI() public view returns (uint256) {
        uint256 balance = agiToken.balanceOf(address(this));
        uint256 reserved = totalEscrowObligations + totalLockedBondObligations;
        if (balance < reserved) revert InsolventEscrowBalance();
        return balance - reserved;
    }

    function withdrawAGI(uint256 amount) external onlyOwner nonReentrant {
        uint256 available = withdrawableAGI();
        if (amount > available) revert InsufficientWithdrawableBalance(amount, available);
        require(agiToken.transfer(owner(), amount), "WITHDRAW_FAILED");
        emit AGISurplusWithdrawn(owner(), amount);
    }

    function rescueERC20(address token, uint256) external pure {
        if (token == AGIALPHA_MAINNET) revert UseWithdrawAGIForSurplus();
        revert("RESCUE_DISABLED");
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _cancel(uint256 jobId, JobState targetState) internal {
        Job storage job = jobs[jobId];
        if (job.state != JobState.Open || (msg.sender != job.employer && msg.sender != owner())) revert InvalidState();
        job.state = targetState;
        totalEscrowObligations -= job.payout;
        require(agiToken.transfer(job.employer, job.payout), "CANCEL_REFUND_FAILED");
        emit JobCancelled(jobId, targetState, job.payout);
    }
}
