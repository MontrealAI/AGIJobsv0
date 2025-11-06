// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ThermoMath} from "../libraries/ThermoMath.sol";

/// @title ThermoMathHarness
/// @notice Exposes ThermoMath.mbWeights for testing via Hardhat
contract ThermoMathHarness {
    function weights(
        int256[] memory E,
        uint256[] memory g,
        int256 T,
        int256 mu
    ) external pure returns (uint256[] memory) {
        return ThermoMath.mbWeights(E, g, T, mu);
    }
}

