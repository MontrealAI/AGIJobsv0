from pathlib import Path

from trm_demo.config import load_settings
from trm_demo.engine import TrmEngine
from trm_demo.ledger import EconomicLedger
from trm_demo.reporting import build_report
from trm_demo.sentinel import Sentinel
from trm_demo.simulation import run_simulation
from trm_demo.thermostat import Thermostat


def test_build_report_contains_markdown_table():
    settings = load_settings(Path(__file__).resolve().parent.parent / "config" / "default_trm_config.yaml")
    engine = TrmEngine(settings)
    ledger = EconomicLedger(
        default_success_value=settings.ledger.default_success_value,
        base_cost_per_call=settings.ledger.base_cost_per_call,
        cost_per_inner_step=settings.ledger.cost_per_inner_step,
        cost_per_outer_step=settings.ledger.cost_per_outer_step,
    )
    summary = run_simulation(
        engine=engine,
        thermostat=Thermostat(settings.thermostat),
        sentinel=Sentinel(settings.sentinel),
        ledger=ledger,
        settings=settings,
        trials=2,
        seed=0,
    )
    report = build_report(summary)
    assert "| Model |" in report
    assert "Tiny Recursive Model" in report
