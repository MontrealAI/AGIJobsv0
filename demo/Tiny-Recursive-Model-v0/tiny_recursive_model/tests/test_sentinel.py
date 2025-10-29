from __future__ import annotations

from tiny_recursive_model import DemoConfig, EconomicLedger, Sentinel


def test_sentinel_triggers_on_cost() -> None:
    config = DemoConfig.from_file(None)
    ledger = EconomicLedger(config.economics)
    sentinel = Sentinel(config.sentinel)
    # Exhaust cost budget quickly
    ledger.record_failure(cost=config.sentinel.max_cost + 1)
    state = sentinel.evaluate(ledger, last_latency_ms=0.0, steps_used=0, outcome=False)
    assert state.halted is True
    assert "Cost" in state.reason
