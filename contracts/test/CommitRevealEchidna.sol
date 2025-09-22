// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {CommitRevealMock} from "../CommitRevealMock.sol";

/// @title CommitRevealEchidnaHarness
/// @notice Harness contract exposing CommitRevealMock to Echidna for invariant testing.
contract CommitRevealEchidnaHarness {
    CommitRevealMock internal immutable commitReveal;

    uint256 internal constant MAX_TRACKED_JOB_IDS = 16;

    // Track the number of successful reveals per job id so we can
    // assert that CommitRevealMock's nonce accounting never drifts.
    mapping(uint256 => uint256) internal successfulReveals;

    constructor() {
        commitReveal = new CommitRevealMock();
    }

    /// @notice Exercise the commit/reveal flow with arbitrary fuzz inputs.
    /// @dev Echidna will mutate the parameters to attempt to break the
    ///      CommitRevealMock invariant that nonce == number of reveals.
    function fuzzCommitAndReveal(
        uint256 rawJobId,
        bool approve,
        bytes32 salt,
        bytes32 specHash
    ) external {
        uint256 jobId = rawJobId % MAX_TRACKED_JOB_IDS;

        bytes32 commitHash = keccak256(
            abi.encodePacked(jobId, commitReveal.nonces(jobId), approve, salt, specHash)
        );

        commitReveal.commit(jobId, commitHash);

        // A correctly constructed commit hash must always make the
        // reveal succeed. We purposely ignore the boolean return value
        // because CommitRevealMock increments its nonce regardless of
        // the decision.
        commitReveal.reveal(jobId, approve, salt, specHash);
        unchecked {
            successfulReveals[jobId] += 1;
        }
    }

    /// @notice Echidna invariant ensuring CommitRevealMock's nonce
    ///         bookkeeping always matches the number of successful
    ///         reveals we recorded for each job id.
    function echidna_nonce_matches_successful_reveals() external view returns (bool) {
        for (uint256 jobId = 0; jobId < MAX_TRACKED_JOB_IDS; ++jobId) {
            if (commitReveal.nonces(jobId) != successfulReveals[jobId]) {
                return false;
            }
        }

        return true;
    }
}
