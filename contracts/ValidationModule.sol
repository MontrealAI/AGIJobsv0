// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ValidationModule
/// @notice Returns predetermined validation outcomes for jobs.
contract ValidationModule is Ownable {
    mapping(uint256 => bool) public outcomes;

    event OutcomeSet(uint256 indexed jobId, bool success);

    constructor(address owner) Ownable(owner) {}

    /// @notice Set the validation outcome for a job.
    function setOutcome(uint256 jobId, bool success) external onlyOwner {
        outcomes[jobId] = success;
        emit OutcomeSet(jobId, success);
    }

    /// @notice Validate a job and return the preset outcome.
    function validate(uint256 jobId) external view returns (bool) {
        return outcomes[jobId];
    }
}

