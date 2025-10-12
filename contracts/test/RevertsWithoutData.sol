// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title RevertsWithoutData
/// @notice Harness contract that always reverts without returning revert data.
/// @dev Used in tests to ensure callers handle empty revert payloads correctly.
contract RevertsWithoutData {
    fallback() external payable {
        assembly {
            revert(0, 0)
        }
    }
}
