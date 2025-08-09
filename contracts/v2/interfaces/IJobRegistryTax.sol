// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IJobRegistryTax
/// @notice Interface exposing tax acknowledgement tracking from the JobRegistry
interface IJobRegistryTax {
    /// @notice Current tax policy version participants must acknowledge
    function taxPolicyVersion() external view returns (uint256);

    /// @notice Mapping of participant to acknowledged tax policy version
    /// @param user Address of the participant
    function taxAcknowledgedVersion(address user) external view returns (uint256);
}
