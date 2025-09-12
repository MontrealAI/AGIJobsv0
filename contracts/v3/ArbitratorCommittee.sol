// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";

/// @title ArbitratorCommittee
/// @notice Handles commit-reveal voting by job validators (jurors) to resolve disputes.
/// @dev Jurors are the validators already selected for the disputed job via the ValidationModule's RANDAO-based selection.
contract ArbitratorCommittee is Ownable, Pausable {
    IJobRegistry public jobRegistry;
    IDisputeModule public disputeModule;
    address public pauser;

    /// @notice Duration of the juror commit phase (seconds).
    uint256 public commitWindow = 1 days;
    /// @notice Duration of the juror reveal phase (seconds).
    uint256 public revealWindow = 1 days;
    /// @notice Slash amount (in tokens) per absentee juror (if any).
    uint256 public absenteeSlash;

    event TimingUpdated(uint256 commitWindow, uint256 revealWindow);
    event AbsenteeSlashUpdated(uint256 amount);
    event PauserUpdated(address indexed pauser);
    event CaseOpened(uint256 indexed jobId, address[] jurors);
    event VoteCommitted(uint256 indexed jobId, address indexed juror, bytes32 commit);
    event VoteRevealed(uint256 indexed jobId, address indexed juror, bool employerWins);
    event CaseFinalized(uint256 indexed jobId, bool employerWins);

    error NotOwnerOrPauser();
    error NotDisputeModule();
    error InvalidWindows();
    error NoCase();
    error CaseAlreadyExists();
    error NotJuror();
    error CommitClosed();
    error AlreadyCommitted();
    error CommitPhaseActive();
    error RevealClosed();
    error BadReveal();
    error AlreadyRevealed();
    error AlreadyFinalized();
    error RevealPhaseOngoing();

    modifier onlyOwnerOrPauser() {
        if (msg.sender != owner() && msg.sender != pauser) revert NotOwnerOrPauser();
        _;
    }
    modifier onlyDisputeModule() {
        if (msg.sender != address(disputeModule)) revert NotDisputeModule();
        _;
    }

    constructor(IJobRegistry _jobRegistry, IDisputeModule _disputeModule) Ownable(msg.sender) {
        jobRegistry = _jobRegistry;
        disputeModule = _disputeModule;
    }

    /// @notice Set an optional pauser address.
    function setPauser(address _pauser) external onlyOwner {
        pauser = _pauser;
        emit PauserUpdated(_pauser);
    }

    /// @notice Update the linked DisputeModule contract.
    function setDisputeModule(IDisputeModule dm) external onlyOwner {
        disputeModule = dm;
    }

    /// @notice Update juror commit/reveal phase durations.
    /// @param commitDur New commit phase duration in seconds.
    /// @param revealDur New reveal phase duration in seconds.
    function setCommitRevealWindows(uint256 commitDur, uint256 revealDur) external onlyOwner {
        if (commitDur == 0 || revealDur == 0) revert InvalidWindows();
        commitWindow = commitDur;
        revealWindow = revealDur;
        emit TimingUpdated(commitDur, revealDur);
    }

    /// @notice Set the per-juror slash amount for missing votes.
    function setAbsenteeSlash(uint256 amount) external onlyOwner {
        absenteeSlash = amount;
        emit AbsenteeSlashUpdated(amount);
    }

    /// @notice Opens a new dispute case and registers jurors (validators) for the job.
    /// @dev Only callable by the DisputeModule when a dispute is raised.
    function openCase(uint256 jobId) external onlyDisputeModule whenNotPaused {
        Case storage c = cases[jobId];
        if (c.jurors.length != 0) revert CaseAlreadyExists();
        address valModAddr = address(jobRegistry.validationModule());
        require(valModAddr != address(0), "no val");  // validation module must be set (keep string for potential deployment check)
        address[] memory jurors = IValidationModule(valModAddr).validators(jobId);
        c.jurors = jurors;
        for (uint256 i = 0; i < jurors.length; ++i) {
            c.isJuror[jurors[i]] = true;
        }
        c.commitDeadline = block.timestamp + commitWindow;
        c.revealDeadline = c.commitDeadline + revealWindow;
        emit CaseOpened(jobId, jurors);
    }

    struct Case {
        address[] jurors;
        mapping(address => bytes32) commits;
        mapping(address => bool) revealed;
        mapping(address => bool) isJuror;
        uint256 reveals;
        uint256 employerVotes;
        bool finalized;
        uint256 commitDeadline;
        uint256 revealDeadline;
    }

    /// @dev Tracks dispute cases by jobId.
    mapping(uint256 => Case) private cases;

    /// @notice Commit a hashed vote for the given dispute (jobId).
    function commit(uint256 jobId, bytes32 commitment) external whenNotPaused {
        Case storage c = cases[jobId];
        if (c.jurors.length == 0) revert NoCase();
        if (block.timestamp > c.commitDeadline) revert CommitClosed();
        if (!c.isJuror[msg.sender]) revert NotJuror();
        if (c.commits[msg.sender] != bytes32(0)) revert AlreadyCommitted();
        c.commits[msg.sender] = commitment;
        emit VoteCommitted(jobId, msg.sender, commitment);
    }

    /// @notice Reveal a vote previously committed by the caller.
    function reveal(uint256 jobId, bool employerWins, uint256 salt) external whenNotPaused {
        Case storage c = cases[jobId];
        if (!c.isJuror[msg.sender]) revert NotJuror();
        if (block.timestamp <= c.commitDeadline) revert CommitPhaseActive();
        if (block.timestamp > c.revealDeadline) revert RevealClosed();
        bytes32 expected = keccak256(abi.encodePacked(msg.sender, jobId, employerWins, salt));
        if (c.commits[msg.sender] != expected) revert BadReveal();
        if (c.revealed[msg.sender]) revert AlreadyRevealed();
        // Record the reveal
        c.revealed[msg.sender] = true;
        c.reveals += 1;
        if (employerWins) {
            c.employerVotes += 1;
        }
        emit VoteRevealed(jobId, msg.sender, employerWins);
    }

    /// @notice Finalize a dispute case once all jurors have revealed or time has expired. Majority vote decides the outcome.
    function finalize(uint256 jobId) external whenNotPaused {
        Case storage c = cases[jobId];
        if (c.finalized) revert AlreadyFinalized();
        if (c.jurors.length == 0) revert NoCase();
        if (c.reveals != c.jurors.length) {
            // If not all jurors revealed, ensure the reveal period has elapsed
            if (block.timestamp <= c.revealDeadline) revert RevealPhaseOngoing();
        }
        c.finalized = true;
        bool employerWins = (c.reveals > 0 && c.employerVotes * 2 > c.reveals);
        address employer = jobRegistry.jobs(jobId).employer;
        // Notify DisputeModule of the resolved outcome
        disputeModule.resolve(jobId, employerWins);
        // Slash any jurors who committed but failed to reveal (absentees)
        bool doSlash = absenteeSlash > 0;
        for (uint256 i = 0; i < c.jurors.length; ++i) {
            address juror = c.jurors[i];
            if (doSlash && c.commits[juror] != bytes32(0) && !c.revealed[juror]) {
                disputeModule.slashValidator(juror, absenteeSlash, employer);
            }
            delete c.isJuror[juror];
        }
        emit CaseFinalized(jobId, employerWins);
        // Free storage for the case
        delete cases[jobId];
    }

    /// @notice Pause all dispute resolution activities (emergency).
    function pause() external onlyOwnerOrPauser {
        _pause();
    }

    /// @notice Unpause dispute resolution activities.
    function unpause() external onlyOwnerOrPauser {
        _unpause();
    }
}
