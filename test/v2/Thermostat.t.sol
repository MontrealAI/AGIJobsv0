// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Thermostat} from "../../contracts/v2/Thermostat.sol";

contract ThermostatTest is Test {
    function test_tickClampsTemperature() public {
        Thermostat t = new Thermostat(int256(100), int256(1), int256(200));
        t.setPID(int256(1), int256(0), int256(0));
        t.tick(int256(500), 0, 0);
        assertEq(t.systemTemperature(), 200);
        t.tick(int256(-1000), 0, 0);
        assertEq(t.systemTemperature(), 1);
    }

    function test_roleTemperatureOverride() public {
        Thermostat t = new Thermostat(int256(100), int256(1), int256(200));
        assertEq(t.getRoleTemperature(Thermostat.Role.Agent), 100);
        t.setRoleTemperature(Thermostat.Role.Agent, int256(150));
        assertEq(t.getRoleTemperature(Thermostat.Role.Agent), 150);
    }
    function test_constructorInvalidBounds() public {
        vm.expectRevert("bounds");
        new Thermostat(int256(100), int256(0), int256(200));
        vm.expectRevert("bounds");
        new Thermostat(int256(100), int256(10), int256(10));
    }

    function test_setRoleTemperatureRequiresPositive() public {
        Thermostat t = new Thermostat(int256(100), int256(1), int256(200));
        vm.expectRevert("bounds");
        t.setRoleTemperature(Thermostat.Role.Agent, int256(0));
        vm.expectRevert("bounds");
        t.setRoleTemperature(Thermostat.Role.Agent, int256(-1));
    }

    function test_tickEmitsEvent() public {
        Thermostat t = new Thermostat(int256(100), int256(1), int256(200));
        t.setPID(int256(1), int256(0), int256(0));

        vm.expectEmit(false, false, false, true, address(t));
        emit Thermostat.TemperatureUpdated(int256(200));
        vm.expectEmit(false, false, false, true, address(t));
        emit Thermostat.Tick(int256(500), int256(0), int256(0), int256(200));
        t.tick(int256(500), int256(0), int256(0));
    }
}

