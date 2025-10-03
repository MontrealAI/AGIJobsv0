// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";
import {IHamiltonian} from "./interfaces/IHamiltonian.sol";

/// @title HamiltonianMonitor
/// @notice Tracks rolling averages of dissipation (D) and utility (U)
///         to derive a simple Hamiltonian metric for the protocol.
/// @dev Exposes the current Hamiltonian via {IHamiltonian} for integration
///      with components such as {StakeManager}.
contract HamiltonianMonitor is Governable, IHamiltonian {
    /// @notice Maximum number of data points to retain in the rolling window.
    uint256 public window;

    /// @dev Circular buffer of recent dissipation values.
    uint256[] private dHistory;

    /// @dev Circular buffer of recent utility values.
    uint256[] private uHistory;

    /// @dev Running sums used to compute rolling averages.
    uint256 private dSum;
    uint256 private uSum;

    /// @dev Next index in the circular buffer to overwrite.
    uint256 private nextIndex;

    /// @notice Emitted whenever a new Hamiltonian value is recorded.
    event HamiltonianUpdated(int256 h);

    /// @notice Emitted when governance clears the stored history.
    event HistoryReset(uint256 previousCount);

    /// @notice Emitted when governance updates the rolling window size.
    event WindowUpdated(uint256 previousWindow, uint256 newWindow, bool historyCleared);

    /// @param _window Number of periods to include in the rolling averages.
    /// @param _governance Timelock or multisig with permission to update.
    constructor(uint256 _window, address _governance) Governable(_governance) {
        require(_window > 0, "window");
        window = _window;
    }

    /// @notice Update the rolling window size used for averages.
    /// @dev Optionally clears the stored history to restart accumulation.
    /// @param newWindow New number of periods to retain.
    /// @param resetHistoryFlag Whether to clear all stored observations.
    function setWindow(uint256 newWindow, bool resetHistoryFlag) external onlyGovernance {
        require(newWindow > 0, "window");

        uint256 previousWindow = window;
        if (resetHistoryFlag) {
            uint256 previousCount = dHistory.length;
            _clearHistory();
            window = newWindow;
            emit HistoryReset(previousCount);
            emit WindowUpdated(previousWindow, newWindow, true);
            return;
        }

        if (previousWindow != newWindow) {
            _normaliseHistory(newWindow);
            window = newWindow;
            emit WindowUpdated(previousWindow, newWindow, false);
        } else {
            _normaliseHistory(newWindow);
        }
    }

    /// @notice Clear the stored dissipation and utility history.
    function resetHistory() external onlyGovernance {
        uint256 previousCount = dHistory.length;
        _clearHistory();
        emit HistoryReset(previousCount);
    }

    /// @notice Record new dissipation and utility measurements.
    /// @dev Only callable by governance to ensure trusted data input.
    /// @param d Dissipation value for the period.
    /// @param u Utility value for the period.
    function record(uint256 d, uint256 u) external onlyGovernance {
        uint256 len = dHistory.length;
        if (len < window) {
            dHistory.push(d);
            uHistory.push(u);
            dSum += d;
            uSum += u;
        } else {
            dSum = dSum - dHistory[nextIndex] + d;
            uSum = uSum - uHistory[nextIndex] + u;
            dHistory[nextIndex] = d;
            uHistory[nextIndex] = u;
        }
        nextIndex = (nextIndex + 1) % window;
        emit HamiltonianUpdated(currentHamiltonian());
    }

    /// @notice Current Hamiltonian computed from rolling averages of D and U.
    function currentHamiltonian() public view override returns (int256) {
        uint256 count = dHistory.length;
        if (count == 0) return 0;
        int256 avgD = int256(dSum / count);
        int256 avgU = int256(uSum / count);
        return avgD - avgU;
    }

    /// @notice Return rolling average of dissipation.
    function averageD() external view returns (uint256) {
        uint256 count = dHistory.length;
        return count == 0 ? 0 : dSum / count;
    }

    /// @notice Return rolling average of utility.
    function averageU() external view returns (uint256) {
        uint256 count = uHistory.length;
        return count == 0 ? 0 : uSum / count;
    }

    /// @notice Return raw history arrays of D and U for off-chain trend analysis.
    function history() external view returns (uint256[] memory d, uint256[] memory u) {
        d = dHistory;
        u = uHistory;
    }

    function _clearHistory() private {
        delete dHistory;
        delete uHistory;
        dSum = 0;
        uSum = 0;
        nextIndex = 0;
    }

    function _normaliseHistory(uint256 newWindow) private {
        uint256 count = dHistory.length;
        if (count == 0) {
            nextIndex = 0;
            return;
        }

        uint256 limit = count;
        if (newWindow < limit) {
            limit = newWindow;
        }

        uint256 start = nextIndex;
        if (count > limit) {
            start = (start + (count - limit)) % count;
        } else if (start >= count) {
            start = 0;
        }

        uint256[] memory tempD = new uint256[](limit);
        uint256[] memory tempU = new uint256[](limit);
        uint256 newSumD;
        uint256 newSumU;

        for (uint256 i = 0; i < limit; i++) {
            uint256 idx = (start + i) % count;
            uint256 dValue = dHistory[idx];
            uint256 uValue = uHistory[idx];
            tempD[i] = dValue;
            tempU[i] = uValue;
            newSumD += dValue;
            newSumU += uValue;
        }

        delete dHistory;
        delete uHistory;
        for (uint256 i = 0; i < limit; i++) {
            dHistory.push(tempD[i]);
            uHistory.push(tempU[i]);
        }
        dSum = newSumD;
        uSum = newSumU;

        if (limit < newWindow) {
            nextIndex = limit;
        } else if (limit == 0) {
            nextIndex = 0;
        } else {
            nextIndex = 0;
        }
    }
}

