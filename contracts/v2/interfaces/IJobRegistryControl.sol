// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ITaxPolicy} from "./ITaxPolicy.sol";

/// @title IJobRegistryControl
/// @notice Partial interface exposing the administrative controls used by the
///         HGM control surface. All functions are privileged setters guarded by
///         governance or pauser roles on the concrete implementation.
interface IJobRegistryControl {
    function setPauserManager(address manager) external;

    function setAgentRootNode(bytes32 node) external;

    function setAgentMerkleRoot(bytes32 root) external;

    function setValidatorRootNode(bytes32 node) external;

    function setValidatorMerkleRoot(bytes32 root) external;

    function bumpAgentAuthCacheVersion() external;

    function setAgentAuthCacheDuration(uint256 duration) external;

    function setFeePool(address feePool) external;

    function setTreasury(address treasury) external;

    function setJobStake(uint96 stake) external;

    function setMinAgentStake(uint256 stake) external;

    function setFeePct(uint256 pct) external;

    function setValidatorRewardPct(uint256 pct) external;

    function setMaxJobReward(uint256 amount) external;

    function setJobDurationLimit(uint256 limit) external;

    function setMaxActiveJobsPerAgent(uint256 limit) external;

    function setExpirationGracePeriod(uint256 period) external;

    function setTaxPolicy(ITaxPolicy policy) external;
}
