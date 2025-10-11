// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IRandaoCoordinator} from "./interfaces/IRandaoCoordinator.sol";
import {AGIALPHA, AGIALPHA_DECIMALS} from "./Constants.sol";
import {TokenAcknowledgement} from "./utils/TokenAcknowledgement.sol";

/// @title RandaoCoordinator
/// @notice Simple commit-reveal randomness aggregator with penalties for
///         non-revealing participants. Participants commit hashed secrets
///         during the commit window and must reveal before the reveal window
///         expires. Revealed secrets are XORed together to form a seed which
///         {random} mixes with `block.prevrandao` so the output changes every
///         block.
contract RandaoCoordinator is Ownable, IRandaoCoordinator {
    /// @notice Duration of the commit phase in seconds.
    uint256 private _commitWindow;
    /// @notice Duration of the reveal phase in seconds.
    uint256 private _revealWindow;
    /// @notice Deposit required with each commit, forfeited if reveal is missed.
    uint256 private _deposit;

    /// @notice Address receiving forfeited deposits.
    address private _treasury;

    /// @notice Token used for deposits.
    IERC20 public token;

    /// @notice Emitted when the deposit token is updated by the owner.
    /// @param previousToken Address of the previous ERC20 token.
    /// @param newToken Address of the new ERC20 token.
    event TokenUpdated(address indexed previousToken, address indexed newToken);

    /// @dev Reverts when attempting to set the zero address as the token.
    error ZeroTokenAddress();

    /// @dev Reverts when attempting to change the token while deposits are held.
    error OutstandingDeposits();

    /// @dev Reverts when the provided token reports unsupported decimals.
    error InvalidTokenDecimals(uint8 actualDecimals);

    /// @dev Reverts when the provided token does not implement ERC20 metadata.
    error TokenMetadataUnavailable();

    /// @notice Emitted when the commit window is updated by the owner.
    /// @param previousWindow Previous window duration in seconds.
    /// @param newWindow New window duration in seconds.
    event CommitWindowUpdated(uint256 indexed previousWindow, uint256 indexed newWindow);

    /// @notice Emitted when the reveal window is updated by the owner.
    /// @param previousWindow Previous window duration in seconds.
    /// @param newWindow New window duration in seconds.
    event RevealWindowUpdated(uint256 indexed previousWindow, uint256 indexed newWindow);

    /// @notice Emitted when the required deposit is updated by the owner.
    /// @param previousDeposit Previous deposit amount in $AGIALPHA wei.
    /// @param newDeposit New deposit amount in $AGIALPHA wei.
    event DepositUpdated(uint256 indexed previousDeposit, uint256 indexed newDeposit);

    /// @notice Emitted when the treasury address is updated by the owner.
    /// @param previousTreasury Address that previously received forfeited deposits.
    /// @param newTreasury Address that now receives forfeited deposits.
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

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
        uint256 commitWindow_,
        uint256 revealWindow_,
        uint256 deposit_,
        address treasury_
    ) Ownable(msg.sender) {
        require(commitWindow_ > 0, "Commit window must be greater than zero");
        require(revealWindow_ > 0, "Reveal window must be greater than zero");
        _commitWindow = commitWindow_;
        _revealWindow = revealWindow_;
        _deposit = deposit_;
        _treasury = treasury_;
        token = IERC20(AGIALPHA);
        TokenAcknowledgement.acknowledge(address(token), address(this));

        emit CommitWindowUpdated(0, commitWindow_);
        emit RevealWindowUpdated(0, revealWindow_);
        emit DepositUpdated(0, deposit_);
        emit TreasuryUpdated(address(0), treasury_);
    }

    /// @notice Current commit window duration in seconds.
    function commitWindow() public view returns (uint256) {
        return _commitWindow;
    }

    /// @notice Current reveal window duration in seconds.
    function revealWindow() public view returns (uint256) {
        return _revealWindow;
    }

    /// @notice Required deposit per commit in $AGIALPHA wei.
    function deposit() public view returns (uint256) {
        return _deposit;
    }

    /// @notice Address that receives forfeited deposits.
    function treasury() public view returns (address) {
        return _treasury;
    }

    /// @notice Updates the commit window duration.
    /// @param newCommitWindow New commit window duration in seconds.
    function setCommitWindow(uint256 newCommitWindow) external onlyOwner {
        require(newCommitWindow > 0, "Commit window must be greater than zero");
        uint256 previous = _commitWindow;
        if (previous == newCommitWindow) {
            return;
        }
        _commitWindow = newCommitWindow;
        emit CommitWindowUpdated(previous, newCommitWindow);
    }

    /// @notice Updates the reveal window duration.
    /// @param newRevealWindow New reveal window duration in seconds.
    function setRevealWindow(uint256 newRevealWindow) external onlyOwner {
        require(newRevealWindow > 0, "Reveal window must be greater than zero");
        uint256 previous = _revealWindow;
        if (previous == newRevealWindow) {
            return;
        }
        _revealWindow = newRevealWindow;
        emit RevealWindowUpdated(previous, newRevealWindow);
    }

    /// @notice Updates the required deposit amount.
    /// @param newDeposit New deposit amount in $AGIALPHA wei.
    function setDeposit(uint256 newDeposit) external onlyOwner {
        uint256 previous = _deposit;
        if (previous == newDeposit) {
            return;
        }
        _deposit = newDeposit;
        emit DepositUpdated(previous, newDeposit);
    }

    /// @notice Updates the treasury address that receives forfeited deposits.
    /// @param newTreasury Address that should receive forfeited deposits.
    function setTreasury(address newTreasury) external onlyOwner {
        address previous = _treasury;
        if (previous == newTreasury) {
            return;
        }
        _treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury);
    }

    /// @notice Updates the ERC20 token used for deposits.
    /// @param newToken Address of the ERC20 token with 18 decimals.
    function setToken(address newToken) external onlyOwner {
        if (newToken == address(0)) revert ZeroTokenAddress();

        address previous = address(token);
        if (previous == newToken) {
            return;
        }

        if (IERC20(previous).balanceOf(address(this)) != 0) {
            revert OutstandingDeposits();
        }

        try IERC20Metadata(newToken).decimals() returns (uint8 decimals) {
            if (decimals != AGIALPHA_DECIMALS) {
                revert InvalidTokenDecimals(decimals);
            }
        } catch {
            revert TokenMetadataUnavailable();
        }

        token = IERC20(newToken);
        TokenAcknowledgement.acknowledge(newToken, address(this));
        emit TokenUpdated(previous, newToken);
    }

    /// @notice Commit a secret hash for a given tag.
    /// @dev Requires prior approval for the deposit amount.
    function commit(bytes32 tag, bytes32 commitment) external override {
        Round storage r = rounds[tag];
        if (r.commitDeadline == 0) {
            r.commitDeadline = block.timestamp + _commitWindow;
            r.revealDeadline = r.commitDeadline + _revealWindow;
        }
        if (block.timestamp > r.commitDeadline) revert("commit closed");
        if (commitments[tag][msg.sender] != bytes32(0)) revert("already committed");
        uint256 currentDeposit = _deposit;
        if (!token.transferFrom(msg.sender, address(this), currentDeposit))
            revert("transfer failed");
        commitments[tag][msg.sender] = commitment;
        r.deposits[msg.sender] = currentDeposit;
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
            if (!token.transfer(msg.sender, dep)) revert("transfer failed");
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
        if (!token.transfer(_treasury, dep)) revert("transfer failed");
        emit DepositForfeited(tag, user, dep);
    }

    /// @dev Reject direct ETH transfers.
    receive() external payable {
        revert("RandaoCoordinator: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("RandaoCoordinator: no ether");
    }
}
