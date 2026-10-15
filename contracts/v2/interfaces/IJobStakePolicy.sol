// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
/// @notice Explicit capability of percentage-stake JobRegistry deployments, absent from legacy v1 bundles.
interface IJobStakePolicy {
    event JobStakeBpsUpdated(uint256 previousBps, uint256 newBps);
    function jobStakeBps() external view returns (uint256);
    function quoteJobStake(uint256 reward) external view returns (uint96);
    function setJobStakeBps(uint256 bps) external;
}
