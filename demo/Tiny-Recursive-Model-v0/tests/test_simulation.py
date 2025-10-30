from pathlib import Path

from trm_demo.config import load_settings
from trm_demo.engine import TrmEngine
from trm_demo.ledger import EconomicLedger
from trm_demo.sentinel import Sentinel
from trm_demo.simulation import run_simulation
from trm_demo.thermostat import Thermostat


def test_simulation_returns_summary():
    settings = load_settings(Path(__file__).resolve().parent.parent / "config" / "default_trm_config.yaml")
    engine = TrmEngine(settings)
    ledger = EconomicLedger(
        default_success_value=settings.ledger.default_success_value,
        base_cost_per_call=settings.ledger.base_cost_per_call,
        cost_per_inner_step=settings.ledger.cost_per_inner_step,
        cost_per_outer_step=settings.ledger.cost_per_outer_step,
    )
    thermostat = Thermostat(settings.thermostat)
    sentinel = Sentinel(settings.sentinel)
    summary = run_simulation(
        engine=engine,
        thermostat=thermostat,
        sentinel=sentinel,
        ledger=ledger,
        settings=settings,
        trials=4,
        seed=2,
    )
    assert summary.greedy.trials >= 1
    assert len(summary.thermostat_trace) >= 1
    assert summary.sentinel_triggered is True
