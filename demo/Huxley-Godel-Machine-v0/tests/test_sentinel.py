from __future__ import annotations

from hgm_demo.engine import HGMEngine
from hgm_demo.metrics import RunMetrics
from hgm_demo.sentinel import Sentinel, SentinelConfig


def test_roi_floor_pauses_expansion() -> None:
    engine = HGMEngine()
    engine.register_root(quality=0.5)
    metrics = RunMetrics(total_cost=100.0, total_gmv=50.0)
    sentinel = Sentinel(SentinelConfig(min_roi=1.0, recovery_roi=1.1))
    outcome = sentinel.inspect(engine, metrics)
    assert not outcome.allow_expansions
    assert "roi_floor" in outcome.triggered_rules


def test_agent_pruned_after_excess_failures() -> None:
    engine = HGMEngine()
    root = engine.register_root(quality=0.5)
    metrics = RunMetrics()
    metrics.agent_failures[root.agent_id] = 10
    sentinel = Sentinel(SentinelConfig(max_failures_per_agent=5))
    outcome = sentinel.inspect(engine, metrics)
    assert f"pruned:{root.agent_id}" in outcome.triggered_rules
    assert engine.get_agent(root.agent_id).status == "pruned"
