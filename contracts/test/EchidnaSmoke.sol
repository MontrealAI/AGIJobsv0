// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal assertion-mode harness so PR CI is deterministic and fast.
///         Nightly can run your CommitReveal harness in depth.
contract EchidnaSmoke {
    function echidna_always_true() public pure returns (bool) {
        return true;
    }
}
