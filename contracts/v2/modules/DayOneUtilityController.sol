// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "../Governable.sol";

/// @title DayOneUtilityController
/// @notice Mirrors the demo owner command deck on-chain so the contract owner
/// can pause, update fees, and refresh narratives with timelock-backed safety.
contract DayOneUtilityController is Governable {
    uint256 public constant MAX_PLATFORM_FEE_BPS = 2_500;
    int256 public constant MIN_LATENCY_GUARD_BPS = -1_000;
    int256 public constant MIN_UTILITY_GUARD_BPS = -1_000;
    int256 public constant MAX_UTILITY_GUARD_BPS = 100_000;

    bool public paused;
    uint256 public platformFeeBps;
    int256 public latencyGuardBps;
    int256 public utilityGuardBps;
    string public narrative;

    event PlatformFeeUpdated(uint256 previousFeeBps, uint256 newFeeBps);
    event LatencyGuardUpdated(int256 previousGuardBps, int256 newGuardBps);
    event UtilityGuardUpdated(int256 previousGuardBps, int256 newGuardBps);
    event NarrativeUpdated(string previousNarrative, string newNarrative);
    event Paused();
    event Unpaused();

    error FeeOutOfRange(uint256 feeBps);
    error LatencyGuardTooLow(int256 guardBps);
    error UtilityGuardOutOfRange(int256 guardBps);
    error AlreadyPaused();
    error AlreadyUnpaused();

    constructor(
        address governance,
        uint256 initialFeeBps,
        int256 initialLatencyGuardBps,
        int256 initialUtilityGuardBps,
        string memory initialNarrative
    )
        Governable(governance)
    {
        _setPlatformFee(initialFeeBps);
        _setLatencyGuard(initialLatencyGuardBps);
        _setUtilityGuard(initialUtilityGuardBps);
        narrative = initialNarrative;
    }

    function setPlatformFee(uint256 newFeeBps) external onlyGovernance {
        uint256 previous = platformFeeBps;
        _setPlatformFee(newFeeBps);
        emit PlatformFeeUpdated(previous, newFeeBps);
    }

    function setLatencyGuard(int256 newGuardBps) external onlyGovernance {
        int256 previous = latencyGuardBps;
        _setLatencyGuard(newGuardBps);
        emit LatencyGuardUpdated(previous, newGuardBps);
    }

    function setUtilityGuard(int256 newGuardBps) external onlyGovernance {
        int256 previous = utilityGuardBps;
        _setUtilityGuard(newGuardBps);
        emit UtilityGuardUpdated(previous, newGuardBps);
    }

    function updateNarrative(string calldata newNarrative) external onlyGovernance {
        string memory previous = narrative;
        narrative = newNarrative;
        emit NarrativeUpdated(previous, newNarrative);
    }

    function togglePause(bool shouldPause) external onlyGovernance {
        if (shouldPause) {
            if (paused) revert AlreadyPaused();
            paused = true;
            emit Paused();
        } else {
            if (!paused) revert AlreadyUnpaused();
            paused = false;
            emit Unpaused();
        }
    }

    function snapshot()
        external
        view
        returns (bool isPaused, uint256 feeBps, int256 latencyGuard, int256 utilityGuard, string memory currentNarrative)
    {
        return (paused, platformFeeBps, latencyGuardBps, utilityGuardBps, narrative);
    }

    function _setPlatformFee(uint256 newFeeBps) internal {
        if (newFeeBps > MAX_PLATFORM_FEE_BPS) revert FeeOutOfRange(newFeeBps);
        platformFeeBps = newFeeBps;
    }

    function _setLatencyGuard(int256 newGuardBps) internal {
        if (newGuardBps < MIN_LATENCY_GUARD_BPS) revert LatencyGuardTooLow(newGuardBps);
        latencyGuardBps = newGuardBps;
    }

    function _setUtilityGuard(int256 newGuardBps) internal {
        if (newGuardBps < MIN_UTILITY_GUARD_BPS || newGuardBps > MAX_UTILITY_GUARD_BPS) {
            revert UtilityGuardOutOfRange(newGuardBps);
        }
        utilityGuardBps = newGuardBps;
    }
}
