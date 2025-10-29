from __future__ import annotations

from tiny_recursive_model import DemoConfig, EconomicLedger, ThermostatController


def test_thermostat_adjusts_parameters() -> None:
    config = DemoConfig.from_file(None)
    thermostat = ThermostatController(config.thermostat)
    ledger = EconomicLedger(config.economics)
    for _ in range(100):
        ledger.record_success(cost=0.0005, value=config.economics.value_per_success)
    state = thermostat.update(ledger)
    assert config.thermostat.min_inner_cycles <= state.inner_cycles <= config.thermostat.max_inner_cycles
    assert config.thermostat.min_outer_steps <= state.outer_steps <= config.thermostat.max_outer_steps
    assert config.thermostat.min_halt_threshold <= state.halt_threshold <= config.thermostat.max_halt_threshold
