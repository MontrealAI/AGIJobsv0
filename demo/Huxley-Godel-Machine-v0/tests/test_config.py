from __future__ import annotations

from hgm_demo.metrics import RunMetrics
from hgm_demo.thermostat import Thermostat, ThermostatConfig
from hgm_demo.engine import HGMEngine


def test_thermostat_increases_tau_when_roi_low() -> None:
    engine = HGMEngine(tau=1.0, alpha=1.2)
    engine.register_root(quality=0.6)
    metrics = RunMetrics(total_cost=200.0, total_gmv=150.0)
    thermostat = Thermostat(ThermostatConfig(target_roi=2.0, boost_roi=3.0))
    decision = thermostat.evaluate(engine, metrics)
    assert decision.tau > 1.0
    assert "ROI under target" in " ".join(decision.notes)


def test_thermostat_scales_concurrency_when_roi_high() -> None:
    config = ThermostatConfig(target_roi=1.0, boost_roi=1.1, max_concurrency=3)
    engine = HGMEngine(tau=1.0, alpha=1.2)
    engine.register_root(quality=0.6)
    metrics = RunMetrics(total_cost=100.0, total_gmv=500.0)
    thermostat = Thermostat(config)
    decision = thermostat.evaluate(engine, metrics)
    assert decision.concurrency == 2
