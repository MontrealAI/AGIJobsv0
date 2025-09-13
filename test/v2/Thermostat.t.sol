// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Thermostat} from "../../contracts/v2/Thermostat.sol";

contract ThermostatTest is Test {
    function test_tickClampsTemperature() public {
        Thermostat t = new Thermostat(int256(100), int256(1), int256(200), address(this));
        t.setPID(int256(1), int256(0), int256(0));
        t.tick(int256(500), 0, 0);
        assertEq(t.systemTemperature(), 200);
        t.tick(int256(-1000), 0, 0);
        assertEq(t.systemTemperature(), 1);
    }

    function test_weightedTickAdjustsError() public {
        Thermostat t = new Thermostat(int256(100), int256(1), int256(200), address(this));
        t.setPID(int256(1), int256(0), int256(0));
        vm.expectEmit(false, false, false, true, address(t));
        emit Thermostat.KPIWeightsUpdated(int256(2), int256(1), int256(0));
        t.setKPIWeights(int256(2), int256(1), int256(0));
        t.tick(int256(10), int256(10), int256(10));
        assertEq(t.systemTemperature(), 130);
    }

    function test_roleTemperatureOverride() public {
        Thermostat t = new Thermostat(int256(100), int256(1), int256(200), address(this));
        assertEq(t.getRoleTemperature(Thermostat.Role.Agent), 100);
        t.setRoleTemperature(Thermostat.Role.Agent, int256(150));
        assertEq(t.getRoleTemperature(Thermostat.Role.Agent), 150);
        t.unsetRoleTemperature(Thermostat.Role.Agent);
        assertEq(t.getRoleTemperature(Thermostat.Role.Agent), 100);
    }
    function test_constructorInvalidBounds() public {
        vm.expectRevert(bytes("bounds"));
        new Thermostat(int256(100), int256(0), int256(200), address(this));
        vm.expectRevert(bytes("bounds"));
        new Thermostat(int256(100), int256(10), int256(10), address(this));
    }

    function test_setRoleTemperatureRequiresPositive() public {
        Thermostat t = new Thermostat(int256(100), int256(1), int256(200), address(this));
        vm.expectRevert(bytes("bounds"));
        t.setRoleTemperature(Thermostat.Role.Agent, int256(0));
        vm.expectRevert(bytes("bounds"));
        t.setRoleTemperature(Thermostat.Role.Agent, int256(-1));
    }

    function test_setSystemTemperatureAndBounds() public {
        Thermostat t = new Thermostat(int256(100), int256(1), int256(200), address(this));
        vm.expectEmit(false, false, false, true, address(t));
        emit Thermostat.TemperatureUpdated(int256(150));
        t.setSystemTemperature(int256(150));
        assertEq(t.systemTemperature(), 150);

        vm.expectRevert(bytes("temp"));
        t.setSystemTemperature(int256(0));

        t.setTemperatureBounds(int256(50), int256(120));
        assertEq(t.systemTemperature(), 120); // clamped to new max

        vm.expectRevert(bytes("bounds"));
        t.setTemperatureBounds(int256(0), int256(10));
    }

    function test_tickEmitsEvent() public {
        Thermostat t = new Thermostat(int256(100), int256(1), int256(200), address(this));
        t.setPID(int256(1), int256(0), int256(0));

        vm.expectEmit(false, false, false, true, address(t));
        emit Thermostat.TemperatureUpdated(int256(200));
        vm.expectEmit(false, false, false, true, address(t));
        emit Thermostat.Tick(int256(500), int256(0), int256(0), int256(200));
        t.tick(int256(500), int256(0), int256(0));
    }
}

