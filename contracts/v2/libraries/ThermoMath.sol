// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ThermoMath
/// @notice Utility functions for computing approximate Maxwell-Boltzmann weights.
library ThermoMath {
    int256 internal constant WAD = 1e18;

    /// @dev simple exponential approximation using 10-term Taylor series
    function _exp(int256 x) private pure returns (uint256) {
        int256 term = WAD;
        int256 sum = WAD;
        for (uint8 i = 1; i < 10; i++) {
            term = (term * x) / int256(WAD) / int256(uint256(i));
            sum += term;
        }
        if (sum < 0) return 0;
        return uint256(sum);
    }

    /// @notice Computes normalized MB-like weights.
    function mbWeights(
        int256[] memory E,
        uint256[] memory g,
        int256 T,
        int256 mu
    ) internal pure returns (uint256[] memory w) {
        require(E.length == g.length, "len");
        uint256 n = E.length;
        w = new uint256[](n);
        uint256[] memory raw = new uint256[](n);
        uint256 sum;
        for (uint256 i = 0; i < n; i++) {
            int256 denom = T == 0 ? int256(1) : T;
            int256 x = ((mu - E[i]) * WAD) / denom;
            uint256 weight = g[i] * _exp(x);
            raw[i] = weight;
            sum += weight;
        }
        if (sum == 0) return w;
        for (uint256 i = 0; i < n; i++) {
            w[i] = (raw[i] * uint256(WAD)) / sum;
        }
    }
}
