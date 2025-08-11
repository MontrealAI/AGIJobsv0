// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IStakeManager {
    function lockReward(address from, uint256 amount) external;
}

/// @title ValidationModule
/// @notice Returns predetermined validation outcomes and supports result challenges.
contract ValidationModule is Ownable {
    mapping(uint256 => bool) public outcomes;

    /// @notice stake manager used to lock dispute bonds
    IStakeManager public stakeManager;
    /// @notice bond required to challenge a result
    uint256 public disputeBond;
    /// @notice period during which challenges are accepted
    uint256 public challengeWindow;
    /// @notice address allowed to clear challenges
    address public disputeResolution;

    /// @dev challenge deadline per job
    mapping(uint256 => uint256) public challengeDeadline;
    /// @dev challenger per job
    mapping(uint256 => address) public challenger;

    event OutcomeSet(uint256 indexed jobId, bool success);
    event OutcomeChallenged(uint256 indexed jobId, address indexed challenger);
    event StakeManagerUpdated(address manager);
    event DisputeBondUpdated(uint256 bond);
    event ChallengeWindowUpdated(uint256 window);
    event DisputeResolutionUpdated(address resolver);

    constructor(address owner) Ownable(owner) {}

    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
    }

    function setDisputeBond(uint256 bond) external onlyOwner {
        disputeBond = bond;
        emit DisputeBondUpdated(bond);
    }

    function setChallengeWindow(uint256 window) external onlyOwner {
        challengeWindow = window;
        emit ChallengeWindowUpdated(window);
    }

    function setDisputeResolution(address resolver) external onlyOwner {
        disputeResolution = resolver;
        emit DisputeResolutionUpdated(resolver);
    }

    /// @notice Set the validation outcome for a job.
    function setOutcome(uint256 jobId, bool success) external onlyOwner {
        outcomes[jobId] = success;
        challengeDeadline[jobId] = block.timestamp + challengeWindow;
        delete challenger[jobId];
        emit OutcomeSet(jobId, success);
    }

    /// @notice Validate a job and return the preset outcome.
    function validate(uint256 jobId) external view returns (bool) {
        return outcomes[jobId];
    }

    /// @notice Challenge a validation result by locking a dispute bond.
    function challenge(uint256 jobId) external {
        require(block.timestamp <= challengeDeadline[jobId], "expired");
        require(challenger[jobId] == address(0), "challenged");
        stakeManager.lockReward(msg.sender, disputeBond);
        challenger[jobId] = msg.sender;
        emit OutcomeChallenged(jobId, msg.sender);
    }

    /// @notice Clear challenge data after resolution.
    function clearChallenge(uint256 jobId) external {
        require(
            msg.sender == disputeResolution || msg.sender == owner(),
            "not authorized"
        );
        delete challenger[jobId];
        delete challengeDeadline[jobId];
    }

    /// @notice Confirms the contract and owner are tax-exempt.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    receive() external payable {
        revert("ValidationModule: no ether");
    }

    fallback() external payable {
        revert("ValidationModule: no ether");
    }
}

