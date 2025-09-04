// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRandaoCoordinator} from "./interfaces/IRandaoCoordinator.sol";

/// @title RandaoCoordinator
/// @notice Simple commit-reveal randomness aggregator with penalties for
///         non-revealing participants. Participants commit hashed secrets
///         during the commit window and must reveal before the reveal window
///         expires. Revealed secrets are XORed together to form a seed which
///         {random} mixes with `block.prevrandao` so the output changes every
///         block.
contract RandaoCoordinator is Ownable, IRandaoCoordinator {
    /// @notice Duration of the commit phase in seconds.
    uint256 public immutable commitWindow;
    /// @notice Duration of the reveal phase in seconds.
    uint256 public immutable revealWindow;
    /// @notice Deposit required with each commit, forfeited if reveal is missed.
    uint256 public immutable deposit;

    /// @notice Address receiving forfeited deposits.
    address payable public immutable treasury;

    struct Round {
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 randomness;
        uint256 commits;
        uint256 reveals;
        mapping(address => uint256) deposits;
    }

    mapping(bytes32 => Round) private rounds;
    mapping(bytes32 => mapping(address => bytes32)) public commitments;
    mapping(bytes32 => mapping(address => bool)) public revealed;

    event Committed(bytes32 indexed tag, address indexed user, bytes32 commitment);
    event Revealed(bytes32 indexed tag, address indexed user, uint256 secret);
    event DepositForfeited(bytes32 indexed tag, address indexed user, uint256 amount);

    constructor(
        uint256 _commitWindow,
        uint256 _revealWindow,
        uint256 _deposit,
        address payable _treasury
    ) Ownable(msg.sender) {
        commitWindow = _commitWindow;
        revealWindow = _revealWindow;
        deposit = _deposit;
        treasury = _treasury;
    }

    /// @notice Commit a secret hash for a given tag.
    function commit(bytes32 tag, bytes32 commitment) external payable override {
        Round storage r = rounds[tag];
        if (r.commitDeadline == 0) {
            r.commitDeadline = block.timestamp + commitWindow;
            r.revealDeadline = r.commitDeadline + revealWindow;
        }
        if (block.timestamp > r.commitDeadline) revert("commit closed");
        if (commitments[tag][msg.sender] != bytes32(0)) revert("already committed");
        if (msg.value != deposit) revert("bad deposit");

        commitments[tag][msg.sender] = commitment;
        r.deposits[msg.sender] = msg.value;
        r.commits += 1;
        emit Committed(tag, msg.sender, commitment);
    }

    /// @notice Reveal the secret used in the commitment.
    function reveal(bytes32 tag, uint256 secret) external override {
        Round storage r = rounds[tag];
        if (block.timestamp <= r.commitDeadline) revert("reveal not started");
        if (block.timestamp > r.revealDeadline) revert("reveal closed");
        if (revealed[tag][msg.sender]) revert("already revealed");

        bytes32 expected = keccak256(abi.encodePacked(msg.sender, tag, secret));
        if (commitments[tag][msg.sender] != expected) revert("bad reveal");

        revealed[tag][msg.sender] = true;
        r.randomness ^= secret;
        r.reveals += 1;

        uint256 dep = r.deposits[msg.sender];
        if (dep > 0) {
            r.deposits[msg.sender] = 0;
            payable(msg.sender).transfer(dep);
        }
        emit Revealed(tag, msg.sender, secret);
    }

    /// @notice Retrieve aggregated randomness for a tag once reveal window passes.
    /// @dev Mixes the XORed seed with `block.prevrandao` so results differ each block.
    function random(bytes32 tag) external view override returns (uint256) {
        Round storage r = rounds[tag];
        if (r.revealDeadline == 0 || block.timestamp <= r.revealDeadline)
            revert("random not ready");
        return uint256(keccak256(abi.encode(r.randomness, block.prevrandao)));
    }

    /// @notice Flag a participant's deposit as forfeited after reveal deadline.
    function forfeit(bytes32 tag, address user) external {
        Round storage r = rounds[tag];
        if (block.timestamp <= r.revealDeadline) revert("too early");
        uint256 dep = r.deposits[user];
        if (dep == 0) revert("no deposit");
        r.deposits[user] = 0;
        treasury.transfer(dep);
        emit DepositForfeited(tag, user, dep);
    }

    // receive ether from commits
    receive() external payable {}
}
