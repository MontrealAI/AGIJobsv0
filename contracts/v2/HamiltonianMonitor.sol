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
    uint256 public immutable window;

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

    /// @param _window Number of periods to include in the rolling averages.
    /// @param _governance Timelock or multisig with permission to update.
    constructor(uint256 _window, address _governance) Governable(_governance) {
        require(_window > 0, "window");
        window = _window;
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
}

