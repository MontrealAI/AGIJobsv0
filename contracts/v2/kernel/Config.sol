// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title KernelConfig
/// @notice Governance owned configuration for protocol risk parameters.
contract KernelConfig is Ownable {
    uint256 public maxJobDuration; // seconds
    uint256 public minAgentStake;
    uint256 public minValidatorStake;
    uint256 public maxConcurrentJobsPerAgent;

    uint256 public minValidators;
    uint256 public approvalThresholdBps;
    uint256 public commitWindow;
    uint256 public revealWindow;
    uint256 public noRevealSlashBps;
    uint256 public maliciousSlashBps;

    event MaxJobDurationUpdated(uint256 value);
    event MinAgentStakeUpdated(uint256 value);
    event MinValidatorStakeUpdated(uint256 value);
    event MaxConcurrentJobsUpdated(uint256 value);
    event ValidatorParamsUpdated(uint256 minValidators, uint256 approvalThresholdBps);
    event WindowsUpdated(uint256 commitWindow, uint256 revealWindow);
    event NoRevealSlashUpdated(uint256 value);
    event MaliciousSlashUpdated(uint256 value);

    error InvalidValue();

    constructor(address owner_) Ownable(owner_) {
        maxJobDuration = 7 days;
        minAgentStake = 1 ether;
        minValidatorStake = 1 ether;
        maxConcurrentJobsPerAgent = 3;
        minValidators = 3;
        approvalThresholdBps = 6_000; // 60%
        commitWindow = 1 days;
        revealWindow = 1 days;
        noRevealSlashBps = 100; // 1%
        maliciousSlashBps = 500; // 5%
    }

    function setMaxJobDuration(uint256 value) external onlyOwner {
        if (value == 0) revert InvalidValue();
        maxJobDuration = value;
        emit MaxJobDurationUpdated(value);
    }

    function setMinAgentStake(uint256 value) external onlyOwner {
        if (value == 0) revert InvalidValue();
        minAgentStake = value;
        emit MinAgentStakeUpdated(value);
    }

    function setMinValidatorStake(uint256 value) external onlyOwner {
        if (value == 0) revert InvalidValue();
        minValidatorStake = value;
        emit MinValidatorStakeUpdated(value);
    }

    function setMaxConcurrentJobs(uint256 value) external onlyOwner {
        if (value == 0) revert InvalidValue();
        maxConcurrentJobsPerAgent = value;
        emit MaxConcurrentJobsUpdated(value);
    }

    function setValidatorParams(uint256 minVals, uint256 approvalBps) external onlyOwner {
        if (minVals == 0 || approvalBps == 0 || approvalBps > 10_000) revert InvalidValue();
        minValidators = minVals;
        approvalThresholdBps = approvalBps;
        emit ValidatorParamsUpdated(minVals, approvalBps);
    }

    function setWindows(uint256 commit, uint256 reveal) external onlyOwner {
        if (commit == 0 || reveal == 0) revert InvalidValue();
        commitWindow = commit;
        revealWindow = reveal;
        emit WindowsUpdated(commit, reveal);
    }

    function setNoRevealSlash(uint256 bps) external onlyOwner {
        if (bps > 10_000) revert InvalidValue();
        noRevealSlashBps = bps;
        emit NoRevealSlashUpdated(bps);
    }

    function setMaliciousSlash(uint256 bps) external onlyOwner {
        if (bps > 10_000) revert InvalidValue();
        maliciousSlashBps = bps;
        emit MaliciousSlashUpdated(bps);
    }
}
