// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ZkBatchVerifier
 * @notice Minimal configurable verifier facade for batched job attestations.
 *         This contract does not implement a full zk-SNARK verifier but enforces deterministic
 *         commitments so the demo can plug in any proving system without code changes.
 */
contract ZkBatchVerifier is Ownable {
    uint256 public maxJobsPerBatch;

    event ProofVerified(
        bytes32 indexed domain,
        bytes32 indexed jobBatchId,
        bytes32 jobsRoot,
        uint256 jobsCount,
        bytes32 proofHash,
        address indexed caller
    );

    error ProofTooLarge(uint256 jobsCount, uint256 maxJobsPerBatch);
    error InvalidProofHash(bytes32 expected, bytes32 actual);

    constructor(uint256 maxJobs) Ownable(msg.sender) {
        maxJobsPerBatch = maxJobs;
    }

    function updateMaxJobs(uint256 newLimit) external onlyOwner {
        maxJobsPerBatch = newLimit;
    }

    function verifyAndEmit(
        bytes calldata zkProof,
        bytes32 expectedHash,
        bytes32 domain,
        bytes32 jobBatchId,
        bytes32 jobsRoot,
        uint256 jobsCount
    ) external returns (bool) {
        if (jobsCount > maxJobsPerBatch) {
            revert ProofTooLarge(jobsCount, maxJobsPerBatch);
        }
        bytes32 actualHash = keccak256(zkProof);
        if (actualHash != expectedHash) {
            revert InvalidProofHash(expectedHash, actualHash);
        }
        emit ProofVerified(domain, jobBatchId, jobsRoot, jobsCount, actualHash, msg.sender);
        return true;
    }
}
