// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Thermostat
/// @notice PID controller maintaining system temperature for reward distribution.
contract Thermostat is Ownable {
    enum Role {Agent, Validator, Operator, Employer}

    int256 public systemTemperature;
    int256 public minTemp;
    int256 public maxTemp;
    int256 public kp;
    int256 public ki;
    int256 public kd;

    mapping(Role => int256) private roleTemps;

    int256 private integral;
    int256 private lastError;

    event TemperatureUpdated(int256 newTemp);
    event RoleTemperatureUpdated(Role role, int256 temp);
    event PIDUpdated(int256 kp, int256 ki, int256 kd);
    event TemperatureBoundsUpdated(int256 minTemp, int256 maxTemp);
    event Tick(int256 emission, int256 backlog, int256 sla, int256 newTemp);

    constructor(int256 _temp, int256 _min, int256 _max) Ownable(msg.sender) {
        require(_min > 0 && _max > _min, "bounds");
        systemTemperature = _temp;
        minTemp = _min;
        maxTemp = _max;
    }

    function setPID(int256 _kp, int256 _ki, int256 _kd) external onlyOwner {
        kp = _kp;
        ki = _ki;
        kd = _kd;
        emit PIDUpdated(_kp, _ki, _kd);
    }

    /// @notice Sets a new system temperature within bounds.
    function setSystemTemperature(int256 temp) external onlyOwner {
        require(temp > 0 && temp >= minTemp && temp <= maxTemp, "temp");
        systemTemperature = temp;
        emit TemperatureUpdated(temp);
    }

    /// @notice Updates minimum and maximum allowable temperatures.
    function setTemperatureBounds(int256 _min, int256 _max) external onlyOwner {
        require(_min > 0 && _max > _min, "bounds");
        minTemp = _min;
        maxTemp = _max;
        if (systemTemperature < minTemp) systemTemperature = minTemp;
        if (systemTemperature > maxTemp) systemTemperature = maxTemp;
        emit TemperatureBoundsUpdated(_min, _max);
        emit TemperatureUpdated(systemTemperature);
    }

    function setRoleTemperature(Role r, int256 temp) external onlyOwner {
        require(temp > 0 && temp >= minTemp && temp <= maxTemp, "bounds");
        roleTemps[r] = temp;
        emit RoleTemperatureUpdated(r, temp);
    }

    /// @notice Removes a role-specific temperature override.
    function unsetRoleTemperature(Role r) external onlyOwner {
        delete roleTemps[r];
        emit RoleTemperatureUpdated(r, 0);
    }

    function getRoleTemperature(Role r) public view returns (int256) {
        int256 t = roleTemps[r];
        if (t == 0) return systemTemperature;
        return t;
    }

    /// @notice Update the system temperature based on KPI observations.
    /// @param emission Current emission growth error.
    /// @param backlog Current backlog age error.
    /// @param sla Current SLA hit rate error.
    function tick(int256 emission, int256 backlog, int256 sla) external onlyOwner {
        int256 error = emission + backlog + sla;
        integral += error;
        int256 derivative = error - lastError;
        int256 delta = kp * error + ki * integral + kd * derivative;
        systemTemperature += delta;
        if (systemTemperature < minTemp) systemTemperature = minTemp;
        if (systemTemperature > maxTemp) systemTemperature = maxTemp;
        require(systemTemperature > 0, "temp");
        lastError = error;
        emit TemperatureUpdated(systemTemperature);
        emit Tick(emission, backlog, sla, systemTemperature);
    }
}

