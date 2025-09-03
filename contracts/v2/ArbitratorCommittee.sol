// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";

/// @title ArbitratorCommittee
/// @notice Handles commit-reveal voting by job validators to resolve disputes.
/// @dev Jurors are the validators already selected for the disputed job via the
///      ValidationModule's RANDAO-based selection.
contract ArbitratorCommittee is Ownable {
    IJobRegistry public jobRegistry;
    IDisputeModule public disputeModule;

    struct Case {
        address[] jurors;
        mapping(address => bytes32) commits;
        mapping(address => bool) revealed;
        uint256 reveals;
        uint256 employerVotes;
        bool finalized;
    }

    mapping(uint256 => Case) private cases;

    event CaseOpened(uint256 indexed jobId, address[] jurors);
    event VoteCommitted(uint256 indexed jobId, address indexed juror, bytes32 commit);
    event VoteRevealed(uint256 indexed jobId, address indexed juror, bool employerWins);
    event CaseFinalized(uint256 indexed jobId, bool employerWins);

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

    /// @notice Opens a new dispute case and seats jurors using validators
    ///         selected by the ValidationModule via RANDAO.
    /// @dev Only callable by the DisputeModule when a dispute is raised.
    function openCase(uint256 jobId) external onlyDisputeModule {
        Case storage c = cases[jobId];
        require(c.jurors.length == 0, "exists");
        address valMod = address(jobRegistry.validationModule());
        require(valMod != address(0), "no val");
        address[] memory jurors = IValidationModule(valMod).validators(jobId);
        c.jurors = jurors;
        emit CaseOpened(jobId, jurors);
    }

    /// @notice Commit a hashed vote for the given job dispute.
    function commit(uint256 jobId, bytes32 commitment) external {
        Case storage c = cases[jobId];
        require(c.jurors.length != 0, "no case");
        require(_isJuror(c.jurors, msg.sender), "not juror");
        require(c.commits[msg.sender] == bytes32(0), "committed");
        c.commits[msg.sender] = commitment;
        emit VoteCommitted(jobId, msg.sender, commitment);
    }

    /// @notice Reveal a vote previously committed.
    function reveal(uint256 jobId, bool employerWins, uint256 salt) external {
        Case storage c = cases[jobId];
        require(_isJuror(c.jurors, msg.sender), "not juror");
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
    function finalize(uint256 jobId) external {
        Case storage c = cases[jobId];
        require(!c.finalized, "finalized");
        require(c.jurors.length != 0, "no case");
        require(c.reveals == c.jurors.length, "unrevealed");
        c.finalized = true;
        bool employerWins = c.employerVotes * 2 > c.jurors.length;
        disputeModule.resolve(jobId, employerWins);
        emit CaseFinalized(jobId, employerWins);
        delete cases[jobId];
    }

    function _isJuror(address[] storage jurors, address account) internal view returns (bool) {
        for (uint256 i = 0; i < jurors.length; ++i) {
            if (jurors[i] == account) {
                return true;
            }
        }
        return false;
    }
}

