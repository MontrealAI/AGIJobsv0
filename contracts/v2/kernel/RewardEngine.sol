// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title RewardEngine
/// @notice Computes protocol reward splits and emits accounting events.
contract RewardEngine is Ownable {
    uint256 public constant BPS_DENOMINATOR = 10_000;

    struct SplitConfig {
        uint256 agentsBps;
        uint256 validatorsBps;
        uint256 opsBps;
        uint256 employerRebateBps;
        uint256 burnBps;
    }

    struct SplitResult {
        uint256 agentAmount;
        uint256 validatorAmount;
        uint256 opsAmount;
        uint256 employerRebateAmount;
        uint256 burnAmount;
    }

    SplitConfig public splits;

    event SplitsUpdated(SplitConfig config);
    event RewardSplit(
        uint256 indexed jobId,
        uint256 total,
        uint256 agentAmount,
        uint256 validatorAmount,
        uint256 opsAmount,
        uint256 employerRebateAmount,
        uint256 burnAmount
    );

    error InvalidSplits();

    constructor(address owner_) Ownable(owner_) {
        splits = SplitConfig({
            agentsBps: 6_500,
            validatorsBps: 2_000,
            opsBps: 1_000,
            employerRebateBps: 400,
            burnBps: 100
        });
        emit SplitsUpdated(splits);
    }

    function setSplits(SplitConfig calldata config) external onlyOwner {
        uint256 sum = config.agentsBps + config.validatorsBps + config.opsBps + config.employerRebateBps + config.burnBps;
        if (sum > BPS_DENOMINATOR) revert InvalidSplits();
        splits = config;
        emit SplitsUpdated(config);
    }

    function split(uint256 jobId, uint256 amount) external returns (SplitResult memory result) {
        SplitConfig memory config = splits;
        uint256 agents = (amount * config.agentsBps) / BPS_DENOMINATOR;
        uint256 validators = (amount * config.validatorsBps) / BPS_DENOMINATOR;
        uint256 ops = (amount * config.opsBps) / BPS_DENOMINATOR;
        uint256 employer = (amount * config.employerRebateBps) / BPS_DENOMINATOR;
        uint256 burn = (amount * config.burnBps) / BPS_DENOMINATOR;
        result = SplitResult({
            agentAmount: agents,
            validatorAmount: validators,
            opsAmount: ops,
            employerRebateAmount: employer,
            burnAmount: burn
        });
        emit RewardSplit(jobId, amount, agents, validators, ops, employer, burn);
    }
}
