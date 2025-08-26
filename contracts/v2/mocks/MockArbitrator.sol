// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title MockArbitrator
/// @notice Simplified external arbitration service used for testing
/// KlerosDisputeModule. It records dispute requests and allows the test to
/// deliver rulings which call back into the dispute module.
contract MockArbitrator {
    address public disputeModule;
    uint256 public lastJobId;
    address public lastClaimant;
    bytes32 public lastEvidence;

    event ArbitrationRequested(uint256 indexed jobId, address indexed claimant, bytes32 evidenceHash);

    function setDisputeModule(address module) external {
        disputeModule = module;
    }

    function createDispute(uint256 jobId, address claimant, bytes32 evidenceHash) external returns (uint256) {
        lastJobId = jobId;
        lastClaimant = claimant;
        lastEvidence = evidenceHash;
        emit ArbitrationRequested(jobId, claimant, evidenceHash);
        return jobId;
    }

    function deliverResult(uint256 jobId, bool employerWins) external {
        IKlerosModule(disputeModule).resolve(jobId, employerWins);
    }
}

interface IKlerosModule {
    function resolve(uint256 jobId, bool employerWins) external;
}
