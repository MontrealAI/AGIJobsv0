// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {ThermoMath} from "../../contracts/v2/libraries/ThermoMath.sol";

contract ThermoMathTest is Test {
    function test_weights_normalize() public {
        int256[] memory E = new int256[](3);
        uint256[] memory g = new uint256[](3);
        E[0] = 1e18; E[1] = 2e18; E[2] = 3e18;
        g[0] = 1; g[1] = 1; g[2] = 1;
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, 0);
        uint256 sum;
        for (uint256 i = 0; i < w.length; i++) sum += w[i];
        assertEq(sum, 1e18, "normalized");
    }

    function test_weights_uniform_when_equal_energy() public {
        int256[] memory E = new int256[](2);
        uint256[] memory g = new uint256[](2);
        E[0] = 1e18; E[1] = 1e18;
        g[0] = 1; g[1] = 1;
        uint256[] memory w = ThermoMath.mbWeights(E, g, 1e18, 0);
        assertApproxEqAbs(w[0], 5e17, 1e12);
        assertApproxEqAbs(w[1], 5e17, 1e12);
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
}

