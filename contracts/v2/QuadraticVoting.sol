// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Governable} from "./Governable.sol";

/// @title QuadraticVoting
/// @notice Minimal quadratic voting contract that charges votes squared in tokens.
/// @dev Tokens used for voting are forwarded to a treasury address. The contract does
///      not implement proposal execution; it only records aggregated vote counts.
contract QuadraticVoting is Governable {
    using SafeERC20 for IERC20;

    /// @notice ERC20 token used for paying voting costs.
    IERC20 public immutable token;
    /// @notice Address receiving voting fees.
    address public treasury;

    struct Proposal {
        uint256 forVotes;
        uint256 againstVotes;
    }

    mapping(uint256 => Proposal) private _proposals;

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 votes,
        uint256 cost
    );
    event TreasuryUpdated(address indexed treasury);

    constructor(IERC20 _token, address _treasury, address _governance)
        Governable(_governance)
    {
        token = _token;
        treasury = _treasury;
    }

    /// @notice Update treasury address.
    function setTreasury(address _treasury) external onlyGovernance {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Returns the token cost to cast a given number of votes.
    function costForVotes(uint256 votes) public pure returns (uint256) {
        return votes * votes;
    }

    /// @notice Cast quadratic votes on a proposal.
    /// @param proposalId The identifier of the proposal.
    /// @param support True for in favour, false against.
    /// @param votes Number of votes to cast. Cost in tokens is votes^2.
    function vote(uint256 proposalId, bool support, uint256 votes) external {
        require(treasury != address(0), "treasury");
        require(votes > 0, "votes");

        uint256 cost = costForVotes(votes);
        token.safeTransferFrom(msg.sender, treasury, cost);

        Proposal storage p = _proposals[proposalId];
        if (support) {
            p.forVotes += votes;
        } else {
            p.againstVotes += votes;
        }

        emit VoteCast(proposalId, msg.sender, support, votes, cost);
    }

    /// @notice Returns total for and against votes for a proposal.
    function proposalVotes(uint256 proposalId)
        external
        view
        returns (uint256 forVotes, uint256 againstVotes)
    {
        Proposal storage p = _proposals[proposalId];
        return (p.forVotes, p.againstVotes);
    }
}

