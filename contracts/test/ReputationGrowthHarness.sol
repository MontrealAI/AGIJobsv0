// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ReputationEngine} from "../v2/ReputationEngine.sol";
import {IStakeManager} from "../v2/interfaces/IStakeManager.sol";

/// @dev Test-only exposure of the production growth helper.
contract ReputationGrowthHarness is ReputationEngine {
    constructor(IStakeManager manager) ReputationEngine(manager) {}

    function growth(uint256 current, uint256 points) external pure returns (uint256) {
        return _enforceReputationGrowth(current, points);
    }
}
