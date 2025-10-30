from pathlib import Path

from trm_demo.config import load_settings
from trm_demo.ledger import EconomicLedger
from trm_demo.sentinel import Sentinel


def test_sentinel_halts_on_consecutive_failures():
    settings = load_settings(Path(__file__).resolve().parent.parent / "config" / "default_trm_config.yaml")
    ledger = EconomicLedger(
        default_success_value=settings.ledger.default_success_value,
        base_cost_per_call=settings.ledger.base_cost_per_call,
        cost_per_inner_step=settings.ledger.cost_per_inner_step,
        cost_per_outer_step=settings.ledger.cost_per_outer_step,
    )
    sentinel = Sentinel(settings.sentinel)
    for _ in range(settings.sentinel.max_consecutive_failures):
        ledger.record_failure(cost=1.0, steps_used=settings.trm.max_inner_steps)
        status = sentinel.evaluate(
            ledger=ledger,
            last_latency_ms=10,
            last_steps=settings.trm.max_inner_steps,
            last_success=False,
        )
    assert status.halted
    assert status.reason is not None
