// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRandaoCoordinator} from "./interfaces/IRandaoCoordinator.sol";
import {AGIALPHA} from "./Constants.sol";

/// @title RandaoCoordinator
/// @notice Simple commit-reveal randomness aggregator with penalties for non-revealing participants.
/// @dev Participants commit hashed secrets during the commit window and must reveal before the reveal window expires. 
/// Revealed secrets are XORed together to form a seed which {random} mixes with `block.prevrandao` so the output changes every block.
contract RandaoCoordinator is Ownable, ReentrancyGuard, IRandaoCoordinator {
    /// @dev Emitted when a user commits a secret.
    event Committed(bytes32 indexed tag, address indexed user, bytes32 commitment);
    /// @dev Emitted when a user successfully reveals their secret.
    event Revealed(bytes32 indexed tag, address indexed user, uint256 secret);
    /// @dev Emitted when a user's deposit is forfeited due to failing to reveal.
    event DepositForfeited(bytes32 indexed tag, address indexed user, uint256 amount);

    error CommitClosed();
    error AlreadyCommitted();
    error TransferFailed();
    error RevealNotStarted();
    error RevealClosed();
    error AlreadyRevealed();
    error BadReveal();
    error RandomNotReady();
    error TooEarly();
    error NoDeposit();
    error EtherNotAccepted();

    /// @notice Duration of the commit phase in seconds.
    uint256 public immutable commitWindow;
    /// @notice Duration of the reveal phase in seconds.
    uint256 public immutable revealWindow;
    /// @notice Deposit required with each commit, forfeited if reveal is missed.
    uint256 public immutable deposit;
    /// @notice Address receiving forfeited deposits.
    address public immutable treasury;
    /// @notice Token used for deposits.
    IERC20 public immutable token;

    struct Round {
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 randomness;
        uint256 commits;
        uint256 reveals;
        mapping(address => uint256) deposits;
    }

    /// @dev Tracks each randomness round by tag.
    mapping(bytes32 => Round) private rounds;
    /// @notice Record of each user's commitment hash per round (tag).
    mapping(bytes32 => mapping(address => bytes32)) public commitments;
    /// @notice Record of whether a user revealed in a round.
    mapping(bytes32 => mapping(address => bool)) public revealed;

    constructor(
        uint256 _commitWindow,
        uint256 _revealWindow,
        uint256 _deposit,
        address _treasury
    ) Ownable(msg.sender) {
        commitWindow = _commitWindow;
        revealWindow = _revealWindow;
        deposit = _deposit;
        treasury = _treasury;
        token = IERC20(AGIALPHA);
    }

    /// @notice Commit a secret hash for a given tag. Requires prior approval for the deposit amount.
    function commit(bytes32 tag, bytes32 commitment) external override nonReentrant {
        Round storage r = rounds[tag];
        if (r.commitDeadline == 0) {
            // initialize deadlines on first commit for this tag
            r.commitDeadline = block.timestamp + commitWindow;
            r.revealDeadline = r.commitDeadline + revealWindow;
        }
        if (block.timestamp > r.commitDeadline) revert CommitClosed();
        if (commitments[tag][msg.sender] != bytes32(0)) revert AlreadyCommitted();
        if (!token.transferFrom(msg.sender, address(this), deposit)) revert TransferFailed();
        commitments[tag][msg.sender] = commitment;
        r.deposits[msg.sender] = deposit;
        r.commits += 1;
        emit Committed(tag, msg.sender, commitment);
    }

    /// @notice Reveal the secret used in the commitment.
    function reveal(bytes32 tag, uint256 secret) external override nonReentrant {
        Round storage r = rounds[tag];
        if (block.timestamp <= r.commitDeadline) revert RevealNotStarted();
        if (block.timestamp > r.revealDeadline) revert RevealClosed();
        if (revealed[tag][msg.sender]) revert AlreadyRevealed();

        // Verify the provided secret matches the commitment
        bytes32 expected = keccak256(abi.encodePacked(msg.sender, tag, secret));
        if (commitments[tag][msg.sender] != expected) revert BadReveal();

        // Mark as revealed and incorporate the secret into randomness
        revealed[tag][msg.sender] = true;
        r.randomness ^= secret;
        r.reveals += 1;

        // Refund the deposit to the revealer
        uint256 dep = r.deposits[msg.sender];
        if (dep > 0) {
            r.deposits[msg.sender] = 0;
            if (!token.transfer(msg.sender, dep)) revert TransferFailed();
        }
        emit Revealed(tag, msg.sender, secret);
    }

    /// @notice Retrieve aggregated randomness for a tag once the reveal window has passed.
    /// @dev Mixes the XORed seed with `block.prevrandao` so results differ each block.
    function random(bytes32 tag) external view override returns (uint256) {
        Round storage r = rounds[tag];
        if (r.revealDeadline == 0 || block.timestamp <= r.revealDeadline) revert RandomNotReady();
        return uint256(keccak256(abi.encode(r.randomness, block.prevrandao)));
    }

    /// @notice Flag a participant's deposit as forfeited after the reveal deadline passes (if they failed to reveal).
    function forfeit(bytes32 tag, address user) external nonReentrant {
        Round storage r = rounds[tag];
        if (block.timestamp <= r.revealDeadline) revert TooEarly();
        uint256 dep = r.deposits[user];
        if (dep == 0) revert NoDeposit();
        r.deposits[user] = 0;
        if (!token.transfer(treasury, dep)) revert TransferFailed();
        emit DepositForfeited(tag, user, dep);
    }

    /// @dev Reject direct ETH transfers.
    receive() external payable {
        revert EtherNotAccepted();
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert EtherNotAccepted();
    }
}
