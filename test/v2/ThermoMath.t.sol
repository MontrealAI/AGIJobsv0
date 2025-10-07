// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {ThermoMath} from "../../contracts/v2/libraries/ThermoMath.sol";
import { SD59x18 } from "@prb/math/src/sd59x18/ValueType.sol";
import { exp } from "@prb/math/src/sd59x18/Math.sol";

int256 constant MAX_EXP_INPUT = 133_084258667509499440;
int256 constant MIN_EXP_INPUT = -41_446531673892822322;

contract ThermoMathTest is Test {
    function test_weights_normalize() public pure {
        int256[] memory E = new int256[](3);
        uint256[] memory g = new uint256[](3);
        E[0] = 1e18; E[1] = 2e18; E[2] = 3e18;
        g[0] = 1; g[1] = 1; g[2] = 1;
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, 0);
        uint256 sum;
        for (uint256 i = 0; i < w.length; i++) {
            assertGe(w[i], 0, "non-negative");
            sum += w[i];
        }
        assertEq(sum, 1e18, "normalized");
    }

    function test_weights_uniform_when_equal_energy() public pure {
        int256[] memory E = new int256[](2);
        uint256[] memory g = new uint256[](2);
        E[0] = 1e18; E[1] = 1e18;
        g[0] = 1; g[1] = 1;
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, 0);
        assertApproxEqAbs(w[0], 5e17, 1e12);
        assertApproxEqAbs(w[1], 5e17, 1e12);
    }

    function test_lower_energy_gets_higher_weight() public pure {
        int256[] memory E = new int256[](2);
        uint256[] memory g = new uint256[](2);
        E[0] = 1e18; // lower energy
        E[1] = 3e18; // higher energy
        g[0] = 1; g[1] = 1;
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, 0);
        assertGt(w[0], w[1], "lower energy should weigh more");
    }

    function test_weight_ratio_matches_exp() public pure {
        int256[] memory E = new int256[](2);
        uint256[] memory g = new uint256[](2);
        E[0] = 1e18;
        E[1] = 4e18;
        g[0] = 1;
        g[1] = 1;
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, 0);
        uint256 ratio = (w[1] * 1e18) / w[0];
        int256 expected = SD59x18.unwrap(exp(SD59x18.wrap(E[0] - E[1])));
        assertApproxEqAbs(ratio, uint256(expected), 1e12);
    }

    function test_degeneracy_scales_weights() public pure {
        int256[] memory E = new int256[](2);
        uint256[] memory g = new uint256[](2);
        E[0] = 1e18; E[1] = 1e18; // equal energies
        g[0] = 2; g[1] = 1; // first participant has double degeneracy
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, 0);
        // weights should be in ratio 2:1 -> 2/3 and 1/3
        assertApproxEqAbs(w[0], 666666666666666667, 1e12);
        assertApproxEqAbs(w[1], 333333333333333333, 1e12);
    }

    function test_reverts_when_temperature_non_positive() public {
        int256[] memory E = new int256[](1);
        uint256[] memory g = new uint256[](1);
        E[0] = 0; g[0] = 1;
        vm.expectRevert(bytes("T>0"));
        ThermoMath.mbWeights(E, g, 0, 0);
    }

    function test_reverts_when_exp_input_too_large() public {
        int256[] memory E = new int256[](1);
        uint256[] memory g = new uint256[](1);
        E[0] = 0; g[0] = 1;
        vm.expectRevert(ThermoMath.ExpInputOutOfBounds.selector);
        ThermoMath.mbWeights(E, g, 1e18, 135e18);
    }

    function test_reverts_when_exp_input_too_small() public {
        int256[] memory E = new int256[](1);
        uint256[] memory g = new uint256[](1);
        E[0] = 0; g[0] = 1;
        vm.expectRevert(ThermoMath.ExpInputOutOfBounds.selector);
        ThermoMath.mbWeights(E, g, 1e18, -42e18);
    }

    function test_reverts_when_energy_gap_exceeds_bounds() public {
        int256[] memory E = new int256[](2);
        uint256[] memory g = new uint256[](2);
        E[0] = 0;
        E[1] = -MAX_EXP_INPUT - 1e18;
        g[0] = 1;
        g[1] = 1;
        vm.expectRevert(ThermoMath.ExpInputOutOfBounds.selector);
        ThermoMath.mbWeights(E, g, 1e18, 0);
    }

    function testFuzz_weight_overflow_reverts(int256 x) public {
        vm.assume(x >= MIN_EXP_INPUT && x <= MAX_EXP_INPUT);
        uint256 expX = uint256(SD59x18.unwrap(exp(SD59x18.wrap(x))));
        vm.assume(expX > 1);
        uint256 gOverflow = type(uint256).max / expX + 1;
        int256[] memory E = new int256[](1);
        uint256[] memory g = new uint256[](1);
        E[0] = 0;
        g[0] = gOverflow;
        vm.expectRevert(ThermoMath.WeightOverflow.selector);
        ThermoMath.mbWeights(E, g, 1e18, x);
    }

    function test_reverts_when_degeneracy_too_large() public {
        int256[] memory E = new int256[](1);
        uint256[] memory g = new uint256[](1);
        E[0] = 0;
        uint256 gOverflow = type(uint256).max / 1e18 + 1;
        g[0] = gOverflow;
        vm.expectRevert(ThermoMath.WeightOverflow.selector);
        ThermoMath.mbWeights(E, g, 1e18, 0);
    }

    function testFuzz_weight_boundary_normalizes(int256 x) public pure {
        vm.assume(x >= MIN_EXP_INPUT && x <= MAX_EXP_INPUT);
        uint256 expX = uint256(SD59x18.unwrap(exp(SD59x18.wrap(x))));
        vm.assume(expX > 0);
        uint256 gLimit = type(uint256).max / expX;
        int256[] memory E = new int256[](1);
        uint256[] memory g = new uint256[](1);
        E[0] = 0;
        g[0] = gLimit;
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, x);
        assertEq(w[0], 1e18, "normalized");
    }

    function test_extreme_energy_skew_normalizes() public pure {
        int256[] memory E = new int256[](2);
        uint256[] memory g = new uint256[](2);
        E[0] = 1e18;
        E[1] = 40e18;
        g[0] = 1;
        g[1] = 1;
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, 0);
        uint256 sum = w[0] + w[1];
        assertApproxEqAbs(sum, 1e18, 1, "normalized");
        assertGt(w[0], 9e17, "low energy dominates");
        assertLt(w[1], 1000, "high energy negligible");
    }

    function test_extreme_degeneracy_normalizes() public pure {
        int256[] memory E = new int256[](2);
        uint256[] memory g = new uint256[](2);
        E[0] = 0;
        E[1] = 0;
        uint256 e = uint256(SD59x18.unwrap(exp(SD59x18.wrap(0))));
        uint256 gLarge = type(uint256).max / e - 1;
        g[0] = gLarge;
        g[1] = 1;
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, 0);
        uint256 sum = w[0] + w[1];
        assertApproxEqAbs(sum, 1e18, 1, "normalized");
    }

    function test_energy_near_exp_bounds_normalizes() public pure {
        int256[] memory E = new int256[](2);
        uint256[] memory g = new uint256[](2);
        E[0] = 0;
        // second energy pushes exponent close to MIN_EXP_INPUT without reverting
        E[1] = -MIN_EXP_INPUT - 1; // 41_446_531_673_892_822_322 - 1
        g[0] = 1;
        g[1] = 1;
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, 0);
        uint256 sum = w[0] + w[1];
        assertApproxEqAbs(sum, 1e18, 1, "normalized");
        assertGt(w[0], 1e18 - 10, "low energy dominates");
        assertLt(w[1], 10, "high energy negligible");
    }
}

