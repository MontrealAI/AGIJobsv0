// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IStakeManager} from "./IStakeManager.sol";

/// @title IReputationEngineControl
/// @notice Administrative hooks exposed to the HGM control module.
interface IReputationEngineControl {
    function setPauser(address pauser) external;

    function setPauserManager(address manager) external;

    function setScoringWeights(uint256 stakeWeight, uint256 reputationWeight) external;

    function setPremiumThreshold(uint256 threshold) external;

    function setValidationRewardPercentage(uint256 percentage) external;

    function setCaller(address caller, bool allowed) external;

    function setBlacklist(address user, bool status) external;

    function setStakeManager(IStakeManager manager) external;
}
