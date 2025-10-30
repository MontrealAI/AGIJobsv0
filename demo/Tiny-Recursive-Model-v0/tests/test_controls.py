from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parent.parent))

import pytest

from trm_demo.config import load_settings
from trm_demo.ledger import EconomicLedger
from trm_demo.sentinel import Sentinel
from trm_demo.thermostat import Thermostat


def _ledger(settings):
    return EconomicLedger(
        default_success_value=settings.ledger.default_success_value,
        base_cost_per_call=settings.ledger.base_cost_per_call,
        cost_per_inner_step=settings.ledger.cost_per_inner_step,
        cost_per_outer_step=settings.ledger.cost_per_outer_step,
    )


def test_thermostat_expands_when_roi_high():
    settings = load_settings(
        Path(__file__).resolve().parent.parent / "config" / "default_trm_config.yaml"
    )
    ledger = _ledger(settings)
    thermostat = Thermostat(settings.thermostat)

    for _ in range(10):
        ledger.record_success(cost=0.5, value=5.0, steps_used=6)
    state = thermostat.update(ledger)
    assert state.inner_steps >= settings.thermostat.min_inner_steps
    assert settings.thermostat.halt_threshold_bounds[0] <= state.halt_threshold <= settings.thermostat.halt_threshold_bounds[1]


def test_sentinel_trips_on_low_roi():
    settings = load_settings(
        Path(__file__).resolve().parent.parent / "config" / "default_trm_config.yaml"
    )
    ledger = _ledger(settings)
    sentinel = Sentinel(settings.sentinel)
    ledger.record_failure(cost=5.0, steps_used=6, latency_ms=10)
    ledger.record_failure(cost=5.0, steps_used=6, latency_ms=10)
    status = sentinel.evaluate(
        ledger=ledger,
        last_latency_ms=10,
        last_steps=settings.trm.max_inner_steps,
        last_success=False,
    )
    assert status.halted
    assert status.reason is not None


def test_ledger_totals():
    settings = load_settings(
        Path(__file__).resolve().parent.parent / "config" / "default_trm_config.yaml"
    )
    ledger = _ledger(settings)
    ledger.record_success(cost=0.2, value=10.0, steps_used=5)
    ledger.record_failure(cost=0.1, steps_used=4)
    totals = ledger.totals
    assert totals["total_cost"] == pytest.approx(0.3)
    assert totals["total_value"] == 10.0
    assert totals["successes"] == 1
    assert totals["failures"] == 1
