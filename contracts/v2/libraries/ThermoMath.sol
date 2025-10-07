// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { SD59x18 } from "@prb/math/src/sd59x18/ValueType.sol";
import { exp } from "@prb/math/src/sd59x18/Math.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title ThermoMath
/// @notice Utility functions for computing approximate Maxwell-Boltzmann weights.
library ThermoMath {
    int256 internal constant WAD = 1e18;

    // The maximum and minimum exponent inputs accepted by the PRBMath `exp` function.
    int256 internal constant MAX_EXP_INPUT = 133_084258667509499440;
    int256 internal constant MIN_EXP_INPUT = -41_446531673892822322;

    error ExpInputOutOfBounds();
    error WeightOverflow();

    /// @dev uses PRBMath's fixed-point exponential
    function _exp(int256 x) private pure returns (uint256) {
        if (x > MAX_EXP_INPUT || x < MIN_EXP_INPUT) {
            revert ExpInputOutOfBounds();
        }
        int256 result = SD59x18.unwrap(exp(SD59x18.wrap(x)));
        return uint256(result);
    }

    /// @notice Compute e^x where x is a signed 18-decimal fixed-point number.
    /// @param x Exponent in WAD format.
    /// @return result Exponential of `x` also scaled by 1e18.
    function expWad(int256 x) internal pure returns (uint256 result) {
        result = _exp(x);
    }

    /// @notice Computes normalized MB-like weights.
    function mbWeights(
        int256[] memory E,
        uint256[] memory g,
        int256 T,
        int256 mu
    ) internal pure returns (uint256[] memory w) {
        require(E.length == g.length, "len");
        require(T > 0, "T>0");
        uint256 n = E.length;
        w = new uint256[](n);
        if (n == 0) return w;
        uint256[] memory raw = new uint256[](n);
        uint256 sum;
        int256 maxE = E[0];
        int256 minE = E[0];
        for (uint256 i = 1; i < n; i++) {
            int256 Ei = E[i];
            if (Ei > maxE) maxE = Ei;
            if (Ei < minE) minE = Ei;
        }
        int256 upper = ((mu - minE) * WAD) / T;
        int256 lower = ((mu - maxE) * WAD) / T;
        if (upper > MAX_EXP_INPUT || lower < MIN_EXP_INPUT) revert ExpInputOutOfBounds();
        for (uint256 i = 0; i < n; i++) {
            int256 x = ((mu - E[i]) * WAD) / T;
            uint256 e = _exp(x);
            if (g[i] > type(uint256).max / e) revert WeightOverflow();
            uint256 weight = g[i] * e;
            raw[i] = weight;
            if (weight > type(uint256).max - sum) revert WeightOverflow();
            sum += weight;
        }
        if (sum == 0) return w;
        uint256 wad = uint256(WAD);
        uint256[] memory remainders = new uint256[](n);
        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            uint256 weightWad = Math.mulDiv(raw[i], wad, sum);
            w[i] = weightWad;
            total += weightWad;
            remainders[i] = mulmod(raw[i], wad, sum);
        }
        if (total == wad) return w;
        uint256 deficit = wad - total;
        while (deficit > 0) {
            uint256 bestIndex;
            uint256 bestRemainder;
            for (uint256 i = 0; i < n; i++) {
                uint256 remainder = remainders[i];
                if (remainder > bestRemainder) {
                    bestRemainder = remainder;
                    bestIndex = i;
                }
            }
            if (bestRemainder == 0) {
                for (uint256 i = 0; i < n && deficit > 0; i++) {
                    w[i] += 1;
                    deficit -= 1;
                }
                break;
            }
            w[bestIndex] += 1;
            remainders[bestIndex] = 0;
            deficit -= 1;
        }
    }
}
