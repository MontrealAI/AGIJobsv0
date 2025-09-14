// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AGIALPHA} from "./Constants.sol";

interface IGovernanceReward {
    function recordVoters(address[] calldata voters) external;
}

/// @title QuadraticVoting
/// @notice Simple quadratic voting mechanism where voting cost grows with the
/// square of votes. Tokens are locked when voting and can be refunded after the
/// proposal is executed. The contract can notify a GovernanceReward contract to
/// record voters for reward distribution.
contract QuadraticVoting is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IGovernanceReward public governanceReward;
    address public proposalExecutor;

    // proposalId => executed status
    mapping(uint256 => bool) public executed;
    // proposalId => voter => votes cast
    mapping(uint256 => mapping(address => uint256)) public votes;
    // proposalId => voter => tokens locked (cost)
    mapping(uint256 => mapping(address => uint256)) public locked;
    // proposalId => list of voters (for reward snapshot)
    mapping(uint256 => address[]) private proposalVoters;
    // proposalId => voter => has voted
    mapping(uint256 => mapping(address => bool)) private hasVoted;

    event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 votes, uint256 cost);
    event ProposalExecuted(uint256 indexed proposalId);
    event RefundClaimed(uint256 indexed proposalId, address indexed voter, uint256 amount);
    event GovernanceRewardUpdated(address indexed governanceReward);
    event ProposalExecutorUpdated(address indexed executor);

    constructor(address _token, address _executor) Ownable(msg.sender) {
        token = _token == address(0) ? IERC20(AGIALPHA) : IERC20(_token);
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

    /// @notice Cast `numVotes` on `proposalId` paying `numVotes^2` tokens.
    function castVote(uint256 proposalId, uint256 numVotes) external {
        require(!executed[proposalId], "executed");
        require(numVotes > 0, "votes");
        uint256 cost = numVotes * numVotes;
        token.safeTransferFrom(msg.sender, address(this), cost);
        locked[proposalId][msg.sender] += cost;
        votes[proposalId][msg.sender] += numVotes;
        if (!hasVoted[proposalId][msg.sender]) {
            hasVoted[proposalId][msg.sender] = true;
            proposalVoters[proposalId].push(msg.sender);
        }
        emit VoteCast(proposalId, msg.sender, numVotes, cost);
    }

    /// @notice Execute a proposal, enabling refunds and recording voters.
    function execute(uint256 proposalId) external {
        require(!executed[proposalId], "executed");
        require(msg.sender == proposalExecutor || msg.sender == owner(), "exec");
        executed[proposalId] = true;
        if (address(governanceReward) != address(0)) {
            governanceReward.recordVoters(proposalVoters[proposalId]);
        }
        emit ProposalExecuted(proposalId);
    }

    /// @notice Claim back tokens locked for a proposal after execution.
    function claimRefund(uint256 proposalId) external {
        require(executed[proposalId], "not executed");
        uint256 amount = locked[proposalId][msg.sender];
        require(amount > 0, "no refund");
        locked[proposalId][msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
        emit RefundClaimed(proposalId, msg.sender, amount);
    }

    /// @notice Returns number of voters for a proposal.
    function proposalVoterCount(uint256 proposalId) external view returns (uint256) {
        return proposalVoters[proposalId].length;
    }
}

