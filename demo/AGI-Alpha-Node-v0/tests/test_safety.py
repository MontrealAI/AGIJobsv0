from __future__ import annotations

from agi_alpha_node_demo.metrics.hub import MetricsHub
from agi_alpha_node_demo.safety.guards import SafetyManager


def test_safety_penalizes_missing_controls() -> None:
    metrics = MetricsHub()
    safety = SafetyManager(metrics)
    snapshot = safety.evaluate(paused=True, stake_ok=False, ens_verified=False)
    assert snapshot.antifragility_score < 0.5


def test_drill_improves_antifragility() -> None:
    metrics = MetricsHub()
    safety = SafetyManager(metrics)
    before = safety.evaluate(paused=False, stake_ok=True, ens_verified=True).antifragility_score
    after = safety.run_drill().antifragility_score
    assert after >= before
