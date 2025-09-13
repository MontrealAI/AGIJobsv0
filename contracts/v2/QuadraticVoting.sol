// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AGIALPHA} from "./Constants.sol";

/// @title QuadraticVoting
/// @notice Simple quadratic voting mechanism where casting v votes costs v^2 tokens.
/// Tokens spent are transferred to a treasury address and are non-refundable.
contract QuadraticVoting is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token = IERC20(AGIALPHA);

    /// @notice address receiving voting costs
    address public treasury;

    struct Proposal {
        bool exists;
        uint256 forVotes;
        uint256 againstVotes;
    }

    mapping(bytes32 => Proposal) private _proposals;
    mapping(bytes32 => mapping(address => uint256)) public votesFor;
    mapping(bytes32 => mapping(address => uint256)) public votesAgainst;

    event TreasuryUpdated(address indexed treasury);
    event ProposalCreated(bytes32 indexed proposalId);
    event VoteCast(
        bytes32 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 votes,
        uint256 cost
    );

    /// @param _treasury destination for spent voting tokens
    constructor(address _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "treasury");
        treasury = _treasury;
    }

    /// @notice set the treasury address receiving voting costs
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice create a new proposal
    /// @param id unique identifier for the proposal
    function createProposal(bytes32 id) external onlyOwner {
        Proposal storage p = _proposals[id];
        require(!p.exists, "exists");
        p.exists = true;
        emit ProposalCreated(id);
    }

    /// @notice cast votes on a proposal
    /// @param id proposal identifier
    /// @param support true for support, false for against
    /// @param votes number of votes to cast (additional votes allowed)
    function vote(bytes32 id, bool support, uint256 votes) external {
        require(votes > 0, "votes");
        Proposal storage p = _proposals[id];
        require(p.exists, "proposal");
        uint256 prev;
        uint256 newTotal;
        if (support) {
            prev = votesFor[id][msg.sender];
            newTotal = prev + votes;
            votesFor[id][msg.sender] = newTotal;
            p.forVotes += votes;
        } else {
            prev = votesAgainst[id][msg.sender];
            newTotal = prev + votes;
            votesAgainst[id][msg.sender] = newTotal;
            p.againstVotes += votes;
        }
        uint256 cost = newTotal * newTotal - prev * prev;
        token.safeTransferFrom(msg.sender, treasury, cost);
        emit VoteCast(id, msg.sender, support, votes, cost);
    }

    /// @notice returns aggregated votes for a proposal
    function proposalVotes(bytes32 id) external view returns (uint256 forVotes, uint256 againstVotes) {
        Proposal storage p = _proposals[id];
        return (p.forVotes, p.againstVotes);
    }
}

