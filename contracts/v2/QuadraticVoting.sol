// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AGIALPHA, BURN_ADDRESS} from "./Constants.sol";
import {IERC20Burnable} from "./interfaces/IERC20Burnable.sol";

interface IGovernanceReward {
    function recordVoters(address[] calldata voters) external;
}

error TokenNotBurnable();

/// @title QuadraticVoting
/// @notice Simple quadratic voting mechanism where voting cost grows with the
/// square of votes. Tokens are locked when voting and can be refunded after the
/// proposal is executed or after the voting deadline expires. The contract can
/// notify a GovernanceReward contract to record voters for reward distribution.
contract QuadraticVoting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IGovernanceReward public governanceReward;
    address public proposalExecutor;
    address public treasury;
    /// @notice percentage of vote cost refunded (0-100)
    uint256 public refundPct = 100;

    // proposalId => executed status
    mapping(uint256 => bool) public executed;
    // proposalId => voting deadline
    mapping(uint256 => uint256) public proposalDeadline;
    // proposalId => marked expired
    mapping(uint256 => bool) public expired;
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
    event ProposalExpired(uint256 indexed proposalId);
    event RefundClaimed(uint256 indexed proposalId, address indexed voter, uint256 amount);
    event GovernanceRewardUpdated(address indexed governanceReward);
    event ProposalExecutorUpdated(address indexed executor);
    event TreasuryUpdated(address indexed treasury);
    event RefundPctUpdated(uint256 refundPct);
    event TokensBurned(uint256 amount);

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

    /// @notice Update the treasury address receiving fees.
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Update refundable percentage of vote cost.
    function setRefundPct(uint256 pct) external onlyOwner {
        require(pct <= 100, "pct");
        refundPct = pct;
        emit RefundPctUpdated(pct);
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

        uint256 deposit = (cost * refundPct) / 100;
        uint256 fee = cost - deposit;
        if (fee > 0) {
            if (treasury != address(0)) token.safeTransfer(treasury, fee);
            else _burnToken(fee);
        }
        if (deposit > 0) {
            locked[proposalId][msg.sender] += deposit;
        }
        votes[proposalId][msg.sender] += numVotes;
        if (!hasVoted[proposalId][msg.sender]) {
            hasVoted[proposalId][msg.sender] = true;
            proposalVoters[proposalId].push(msg.sender);
        }
        emit VoteCast(proposalId, msg.sender, numVotes, cost);
    }

    /// @notice Execute a proposal, enabling refunds and recording voters.
    function execute(uint256 proposalId) external nonReentrant {
        require(!executed[proposalId], "executed");
        require(msg.sender == proposalExecutor || msg.sender == owner(), "exec");
        executed[proposalId] = true;
        if (address(governanceReward) != address(0)) {
            governanceReward.recordVoters(proposalVoters[proposalId]);
        }
        emit ProposalExecuted(proposalId);
    }

    /// @notice Claim back tokens locked for a proposal after execution or expiry.
    function claimRefund(uint256 proposalId) external nonReentrant {
        uint256 amount = locked[proposalId][msg.sender];
        require(amount > 0, "no refund");
        if (!executed[proposalId]) {
            uint256 d = proposalDeadline[proposalId];
            require(d != 0 && block.timestamp > d, "inactive");
            if (!expired[proposalId]) {
                expired[proposalId] = true;
                emit ProposalExpired(proposalId);
            }
        }
        locked[proposalId][msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
        emit RefundClaimed(proposalId, msg.sender, amount);
    }

    /// @notice Returns number of voters for a proposal.
    function proposalVoterCount(uint256 proposalId) external view returns (uint256) {
        return proposalVoters[proposalId].length;
    }

    function _burnToken(uint256 amount) internal {
        if (amount == 0) return;
        if (BURN_ADDRESS == address(0)) {
            try IERC20Burnable(address(token)).burn(amount) {
                emit TokensBurned(amount);
            } catch {
                revert TokenNotBurnable();
            }
        } else {
            token.safeTransfer(BURN_ADDRESS, amount);
            emit TokensBurned(amount);
        }
    }
}

