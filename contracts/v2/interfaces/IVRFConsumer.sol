// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IVRFConsumer
/// @notice Interface for VRF consumer contracts callable by ValidationModule.
interface IVRFConsumer {
    /// @notice Request random words from the underlying VRF coordinator.
    /// @return requestId Identifier for the randomness request.
    function requestRandomWords() external returns (uint256 requestId);
}
