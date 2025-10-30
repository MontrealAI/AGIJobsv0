from pathlib import Path

from trm_demo.config import load_settings
from trm_demo.ledger import EconomicLedger
from trm_demo.thermostat import Thermostat


def test_thermostat_compresses_steps_when_roi_low():
    settings = load_settings(Path(__file__).resolve().parent.parent / "config" / "default_trm_config.yaml")
    ledger = EconomicLedger(
        default_success_value=settings.ledger.default_success_value,
        base_cost_per_call=settings.ledger.base_cost_per_call,
        cost_per_inner_step=settings.ledger.cost_per_inner_step,
        cost_per_outer_step=settings.ledger.cost_per_outer_step,
    )
    thermostat = Thermostat(settings.thermostat)
    # Log a failure with cost but zero value to push ROI down
    ledger.record_failure(cost=1.0, steps_used=settings.trm.max_inner_steps)
    state = thermostat.update(ledger)
    assert state.inner_steps <= settings.trm.max_inner_steps
    assert state.outer_steps <= settings.trm.max_outer_steps
