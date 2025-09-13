// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Governable} from "./Governable.sol";

/// @title Thermostat
/// @notice PID controller maintaining system temperature for reward distribution.
contract Thermostat is Governable {
    enum Role {Agent, Validator, Operator, Employer}

    int256 public systemTemperature;
    int256 public minTemp;
    int256 public maxTemp;
    int256 public kp;
    int256 public ki;
    int256 public kd;
    int256 public integralMin;
    int256 public integralMax;

    int256 public wEmission = 1;
    int256 public wBacklog = 1;
    int256 public wSla = 1;

    mapping(Role => int256) private roleTemps;

    int256 private integral;
    int256 private lastError;

    event TemperatureUpdated(int256 newTemp);
    event RoleTemperatureUpdated(Role role, int256 temp);
    event PIDUpdated(int256 kp, int256 ki, int256 kd);
    event TemperatureBoundsUpdated(int256 minTemp, int256 maxTemp);
    event KPIWeightsUpdated(int256 wEmission, int256 wBacklog, int256 wSla);
    event Tick(int256 emission, int256 backlog, int256 sla, int256 newTemp);
    event IntegralBoundsUpdated(int256 integralMin, int256 integralMax);

    constructor(int256 _temp, int256 _min, int256 _max, address _governance)
        Governable(_governance)
    {
        require(_min > 0 && _max > _min, "bounds");
        systemTemperature = _temp;
        minTemp = _min;
        maxTemp = _max;
        integralMin = type(int256).min;
        integralMax = type(int256).max;
    }

    /// @notice Set PID gains for adjusting system temperature.
    /// @param _kp Proportional gain.
    /// @param _ki Integral gain.
    /// @param _kd Derivative gain.
    function setPID(int256 _kp, int256 _ki, int256 _kd) external onlyGovernance {
        kp = _kp;
        ki = _ki;
        kd = _kd;
        emit PIDUpdated(_kp, _ki, _kd);
    }

    /// @notice Weight each KPI's contribution to thermal error.
    /// @param _wEmission Multiplier for emission error.
    /// @param _wBacklog Multiplier for backlog error.
    /// @param _wSla Multiplier for SLA error.
    function setKPIWeights(int256 _wEmission, int256 _wBacklog, int256 _wSla)
        external
        onlyGovernance
    {
        wEmission = _wEmission;
        wBacklog = _wBacklog;
        wSla = _wSla;
        emit KPIWeightsUpdated(_wEmission, _wBacklog, _wSla);
    }

    /// @notice Sets a new system temperature within bounds.
    /// @param temp Desired system temperature.
    function setSystemTemperature(int256 temp) external onlyGovernance {
        require(temp > 0 && temp >= minTemp && temp <= maxTemp, "temp");
        systemTemperature = temp;
        emit TemperatureUpdated(temp);
    }

    /// @notice Updates minimum and maximum allowable temperatures.
    /// @param _min New minimum temperature.
    /// @param _max New maximum temperature.
    function setTemperatureBounds(int256 _min, int256 _max) external onlyGovernance {
        require(_min > 0 && _max > _min, "bounds");
        minTemp = _min;
        maxTemp = _max;
        if (systemTemperature < minTemp) systemTemperature = minTemp;
        if (systemTemperature > maxTemp) systemTemperature = maxTemp;
        emit TemperatureBoundsUpdated(_min, _max);
        emit TemperatureUpdated(systemTemperature);
    }

    /// @notice Update the integral term bounds to prevent windup.
    /// @param _min New minimum integral value.
    /// @param _max New maximum integral value.
    function setIntegralBounds(int256 _min, int256 _max) external onlyGovernance {
        require(_max > _min, "bounds");
        integralMin = _min;
        integralMax = _max;
        emit IntegralBoundsUpdated(_min, _max);
    }

    /// @notice Override system temperature for a specific role.
    /// @param r Role to update.
    /// @param temp New temperature for the role.
    function setRoleTemperature(Role r, int256 temp) external onlyGovernance {
        require(temp > 0 && temp >= minTemp && temp <= maxTemp, "bounds");
        roleTemps[r] = temp;
        emit RoleTemperatureUpdated(r, temp);
    }

    /// @notice Removes a role-specific temperature override.
    /// @param r Role whose override is cleared.
    function unsetRoleTemperature(Role r) external onlyGovernance {
        delete roleTemps[r];
        emit RoleTemperatureUpdated(r, 0);
    }

    /// @notice Return the temperature applied to a role.
    /// @param r Role being queried.
    /// @return Temperature value for the role or system default.
    function getRoleTemperature(Role r) public view returns (int256) {
        int256 t = roleTemps[r];
        if (t == 0) return systemTemperature;
        return t;
    }

    /// @notice Update the system temperature based on KPI observations.
    /// @param emission Current emission growth error.
    /// @param backlog Current backlog age error.
    /// @param sla Current SLA hit rate error.
    function tick(int256 emission, int256 backlog, int256 sla) external onlyGovernance {
        int256 error =
            wEmission * emission + wBacklog * backlog + wSla * sla;
        integral += error;
        if (integral < integralMin) integral = integralMin;
        if (integral > integralMax) integral = integralMax;
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

