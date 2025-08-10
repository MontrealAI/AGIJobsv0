// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IVRF
/// @notice Placeholder interface for future VRF integrations without subscription.
interface IVRF {
    /// @notice Request random words from a VRF provider.
    /// @return requestId Identifier for the randomness request.
    function requestRandomWords() external returns (uint256 requestId);
}
