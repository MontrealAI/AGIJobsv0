from __future__ import annotations

import torch

from tiny_recursive_model_v0.config import SentinelConfig
from tiny_recursive_model_v0.engine import InferenceTelemetry
from tiny_recursive_model_v0.ledger import EconomicLedger
from tiny_recursive_model_v0.sentinel import Sentinel


def make_telemetry(cycles: int = 6, steps: int = 3, halted: bool = True) -> InferenceTelemetry:
    logits = torch.zeros(1, 2)
    logits[:, 0] = 1.0
    probabilities = torch.softmax(logits, dim=-1)
    return InferenceTelemetry(
        steps_used=steps,
        cycles_used=cycles,
        halted_early=halted,
        halt_probabilities=[0.6, 0.7, 0.8],
        logits=logits,
        probabilities=probabilities,
    )


def test_sentinel_pauses_on_roi_drop():
    ledger = EconomicLedger(value_per_success=100.0, base_compute_cost=0.001, cost_per_cycle=0.0001, daily_budget=1.0)
    config = SentinelConfig(
        min_roi=1.5,
        max_daily_cost=1.0,
        max_latency_ms=1000,
        max_total_cycles=20,
        failure_backoff_limit=3,
    )
    sentinel = Sentinel(config, ledger)
    entry = ledger.record_failure(cost=1.0, cycles_used=6, latency_ms=100.0)
    status = sentinel.evaluate(entry, make_telemetry())
    assert status.paused is True
    assert status.reason is not None


def test_sentinel_force_pause():
    ledger = EconomicLedger(value_per_success=100.0, base_compute_cost=0.001, cost_per_cycle=0.0001, daily_budget=1.0)
    config = SentinelConfig(
        min_roi=1.0,
        max_daily_cost=10.0,
        max_latency_ms=1000,
        max_total_cycles=20,
        failure_backoff_limit=3,
    )
    sentinel = Sentinel(config, ledger)
    status = sentinel.force_pause("manual")
    assert status.paused is True
    assert sentinel.paused is True
    assert sentinel.reason == "manual"
