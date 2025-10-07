// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {AGIGovernor} from "../v2/governance/AGIGovernor.sol";

contract GovernorHarness is AGIGovernor {
    constructor(
        IVotes votingToken,
        TimelockController timelock,
        uint48 votingDelayBlocks,
        uint32 votingPeriodBlocks,
        uint256 proposalThresholdVotes,
        uint256 quorumFraction
    )
        AGIGovernor(
            votingToken,
            timelock,
            votingDelayBlocks,
            votingPeriodBlocks,
            proposalThresholdVotes,
            quorumFraction
        )
    {}

    function executorAddress() external view returns (address) {
        return _executor();
    }
}
