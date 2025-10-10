// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";

/// @title ArbitratorCommittee
/// @notice Handles commit-reveal voting by job validators to resolve disputes.
/// @dev Jurors are the validators already selected for the disputed job via the
///      ValidationModule's RANDAO-based selection.
contract ArbitratorCommittee is Ownable, Pausable {
    error NotOwnerOrPauserManager();
    IJobRegistry public jobRegistry;
    IDisputeModule public disputeModule;
    address public pauser;
    address public pauserManager;

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

    mapping(uint256 => Case) private cases;

    uint256 public commitWindow = 1 days;
    uint256 public revealWindow = 1 days;
    uint256 public absenteeSlash;

    event TimingUpdated(uint256 commitWindow, uint256 revealWindow);
    event AbsenteeSlashUpdated(uint256 amount);
    event PauserUpdated(address indexed pauser);
    event PauserManagerUpdated(address indexed pauserManager);

    event CaseOpened(uint256 indexed jobId, address[] jurors);
    event VoteCommitted(uint256 indexed jobId, address indexed juror, bytes32 commit);
    event VoteRevealed(uint256 indexed jobId, address indexed juror, bool employerWins);
    event CaseFinalized(uint256 indexed jobId, bool employerWins);

    modifier onlyOwnerOrPauser() {
        require(
            msg.sender == owner() || msg.sender == pauser,
            "owner or pauser only"
        );
        _;
    }

    function setPauser(address _pauser) external {
        if (msg.sender != owner() && msg.sender != pauserManager) {
            revert NotOwnerOrPauserManager();
        }
        pauser = _pauser;
        emit PauserUpdated(_pauser);
    }

    function setPauserManager(address manager) external onlyOwner {
        pauserManager = manager;
        emit PauserManagerUpdated(manager);
    }

    constructor(IJobRegistry _jobRegistry, IDisputeModule _disputeModule)
        Ownable(msg.sender)
    {
        jobRegistry = _jobRegistry;
        disputeModule = _disputeModule;
    }

    modifier onlyDisputeModule() {
        require(msg.sender == address(disputeModule), "not dispute");
        _;
    }

    /// @notice Update the linked dispute module.
    function setDisputeModule(IDisputeModule dm) external onlyOwner {
        disputeModule = dm;
    }

    function setCommitRevealWindows(uint256 commitDur, uint256 revealDur)
        external
        onlyOwner
    {
        require(commitDur > 0 && revealDur > 0, "windows");
        commitWindow = commitDur;
        revealWindow = revealDur;
        emit TimingUpdated(commitDur, revealDur);
    }

    function setAbsenteeSlash(uint256 amount) external onlyOwner {
        absenteeSlash = amount;
        emit AbsenteeSlashUpdated(amount);
    }

    /// @notice Opens a new dispute case and seats jurors using validators
    ///         selected by the ValidationModule via RANDAO.
    /// @dev Only callable by the DisputeModule when a dispute is raised.
    function openCase(uint256 jobId) external onlyDisputeModule whenNotPaused {
        Case storage c = cases[jobId];
        require(c.jurors.length == 0, "exists");
        address valMod = address(jobRegistry.validationModule());
        require(valMod != address(0), "no val");
        address[] memory jurors = IValidationModule(valMod).validators(jobId);
        c.jurors = jurors;
        for (uint256 i; i < jurors.length; ++i) {
            c.isJuror[jurors[i]] = true;
        }
        c.commitDeadline = block.timestamp + commitWindow;
        c.revealDeadline = c.commitDeadline + revealWindow;
        emit CaseOpened(jobId, jurors);
    }

    /// @notice Commit a hashed vote for the given job dispute.
    function commit(uint256 jobId, bytes32 commitment) external whenNotPaused {
        Case storage c = cases[jobId];
        require(c.jurors.length != 0, "no case");
        require(block.timestamp <= c.commitDeadline, "commit over");
        require(c.isJuror[msg.sender], "not juror");
        require(c.commits[msg.sender] == bytes32(0), "committed");
        c.commits[msg.sender] = commitment;
        emit VoteCommitted(jobId, msg.sender, commitment);
    }

    /// @notice Reveal a vote previously committed.
    function reveal(uint256 jobId, bool employerWins, uint256 salt) external whenNotPaused {
        Case storage c = cases[jobId];
        require(c.isJuror[msg.sender], "not juror");
        require(block.timestamp > c.commitDeadline, "commit phase");
        require(block.timestamp <= c.revealDeadline, "reveal over");
        bytes32 expected = keccak256(abi.encodePacked(msg.sender, jobId, employerWins, salt));
        require(c.commits[msg.sender] == expected, "bad reveal");
        require(!c.revealed[msg.sender], "revealed");
        c.revealed[msg.sender] = true;
        c.reveals += 1;
        if (employerWins) {
            c.employerVotes += 1;
        }
        emit VoteRevealed(jobId, msg.sender, employerWins);
    }

    /// @notice Finalize a case once all jurors have revealed. Majority wins.
    function finalize(uint256 jobId) external whenNotPaused {
        Case storage c = cases[jobId];
        require(!c.finalized, "finalized");
        require(c.jurors.length != 0, "no case");
        if (c.reveals != c.jurors.length) {
            require(block.timestamp > c.revealDeadline, "active");
        }
        c.finalized = true;
        bool employerWins = c.reveals > 0 && c.employerVotes * 2 > c.reveals;
        address employer = jobRegistry.jobs(jobId).employer;
        disputeModule.resolveDispute(jobId, employerWins);
        bool doSlash = absenteeSlash > 0;
        for (uint256 i; i < c.jurors.length; ++i) {
            address juror = c.jurors[i];
            if (doSlash && c.commits[juror] != bytes32(0) && !c.revealed[juror]) {
                disputeModule.slashValidator(juror, absenteeSlash, employer);
            }
            delete c.isJuror[juror];
        }
        emit CaseFinalized(jobId, employerWins);
        delete cases[jobId];
    }

    /// @notice Pause dispute resolution activities.
    function pause() external onlyOwnerOrPauser {
        _pause();
    }

    /// @notice Unpause dispute resolution activities.
    function unpause() external onlyOwnerOrPauser {
        _unpause();
    }
}

