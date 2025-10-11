// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AGIALPHA} from "./Constants.sol";
import {TokenAcknowledgement} from "./utils/TokenAcknowledgement.sol";

interface IGovernanceReward {
    function recordVoters(address[] calldata voters) external;
}

/// @title QuadraticVoting
/// @notice Simple quadratic voting mechanism where voting cost grows with the
/// square of votes. Tokens are held by this contract when voting and can be
/// claimed back as rewards after the proposal is executed. Rewards are
/// distributed proportionally to the square root of the voting cost, and any
/// residual balance can be swept to a treasury once rewards settle. The
/// contract can notify a GovernanceReward contract to record voters for reward
/// distribution.
contract QuadraticVoting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IGovernanceReward public governanceReward;
    address public proposalExecutor;
    address public treasury;

    // proposalId => executed status
    mapping(uint256 => bool) public executed;
    // proposalId => voting deadline
    mapping(uint256 => uint256) public proposalDeadline;
    // proposalId => voter => votes cast
    mapping(uint256 => mapping(address => uint256)) public votes;
    // proposalId => voter => total cost paid
    mapping(uint256 => mapping(address => uint256)) public costs;
    // proposalId => total cost paid by all voters
    mapping(uint256 => uint256) public totalCost;
    // proposalId => sum of sqrt(cost) for all voters
    mapping(uint256 => uint256) public totalSqrtCost;
    // proposalId => list of voters (for reward snapshot)
    mapping(uint256 => address[]) private proposalVoters;
    // proposalId => voter => has voted
    mapping(uint256 => mapping(address => bool)) private hasVoted;
    // proposalId => voter => reward claimed
    mapping(uint256 => mapping(address => bool)) public rewardClaimed;

    event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 votes, uint256 cost);
    event ProposalExecuted(uint256 indexed proposalId);
    event RewardClaimed(uint256 indexed proposalId, address indexed voter, uint256 amount);
    event GovernanceRewardUpdated(address indexed governanceReward);
    event ProposalExecutorUpdated(address indexed executor);
    event TreasuryUpdated(address indexed treasury);

    constructor(address _token, address _executor) Ownable(msg.sender) {
        token = _token == address(0) ? IERC20(AGIALPHA) : IERC20(_token);
        TokenAcknowledgement.acknowledge(address(token), address(this));
        proposalExecutor = _executor;
        emit ProposalExecutorUpdated(_executor);
    }

    /// @notice Set the governance reward contract used for recording voters.
    function setGovernanceReward(IGovernanceReward reward) external onlyOwner {
        governanceReward = reward;
        emit GovernanceRewardUpdated(address(reward));
    }

    /// @notice Set the address allowed to execute proposals.
    function setProposalExecutor(address executor) external onlyOwner {
        proposalExecutor = executor;
        emit ProposalExecutorUpdated(executor);
    }

    /// @notice Update the treasury address receiving fees.
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Cast `numVotes` on `proposalId` paying `numVotes^2` tokens with a voting deadline.
    function castVote(uint256 proposalId, uint256 numVotes, uint256 deadline) external nonReentrant {
        require(!executed[proposalId], "executed");
        require(numVotes > 0, "votes");
        uint256 d = proposalDeadline[proposalId];
        if (d == 0) {
            require(deadline > block.timestamp, "deadline");
            proposalDeadline[proposalId] = deadline;
        } else {
            require(block.timestamp <= d, "expired");
        }
        uint256 cost = numVotes * numVotes;
        token.safeTransferFrom(msg.sender, address(this), cost);

        uint256 oldCost = costs[proposalId][msg.sender];
        uint256 newCost = oldCost + cost;
        costs[proposalId][msg.sender] = newCost;
        totalCost[proposalId] += cost;
        uint256 prevSqrt = Math.sqrt(oldCost);
        uint256 newSqrt = Math.sqrt(newCost);
        totalSqrtCost[proposalId] = totalSqrtCost[proposalId] + newSqrt - prevSqrt;
        votes[proposalId][msg.sender] += numVotes;
        if (!hasVoted[proposalId][msg.sender]) {
            hasVoted[proposalId][msg.sender] = true;
            proposalVoters[proposalId].push(msg.sender);
        }
        emit VoteCast(proposalId, msg.sender, numVotes, cost);
    }

    /// @notice Execute a proposal, enabling reward claims and recording voters.
    function execute(uint256 proposalId) external nonReentrant {
        require(!executed[proposalId], "executed");
        require(msg.sender == proposalExecutor || msg.sender == owner(), "exec");
        executed[proposalId] = true;
        if (address(governanceReward) != address(0)) {
            governanceReward.recordVoters(proposalVoters[proposalId]);
        }
        emit ProposalExecuted(proposalId);
    }

    /// @notice Claim reward proportional to `sqrt(cost)` after proposal execution.
    function claimReward(uint256 proposalId) external nonReentrant {
        require(executed[proposalId], "inactive");
        uint256 userCost = costs[proposalId][msg.sender];
        require(userCost > 0, "no reward");
        require(!rewardClaimed[proposalId][msg.sender], "claimed");
        rewardClaimed[proposalId][msg.sender] = true;
        uint256 reward = (totalCost[proposalId] * Math.sqrt(userCost)) / totalSqrtCost[proposalId];
        token.safeTransfer(msg.sender, reward);
        emit RewardClaimed(proposalId, msg.sender, reward);
    }

    /// @notice Sweep remaining contract balance to the treasury after rewards settle.
    function sweepTreasury() external onlyOwner nonReentrant {
        address sweepRecipient = treasury;
        require(sweepRecipient != address(0), "treasury");
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(sweepRecipient, balance);
    }

    /// @notice Returns number of voters for a proposal.
    function proposalVoterCount(uint256 proposalId) external view returns (uint256) {
        return proposalVoters[proposalId].length;
    }
}

