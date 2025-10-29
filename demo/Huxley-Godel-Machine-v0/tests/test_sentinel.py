from __future__ import annotations

import random
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))
from hgm_v0_demo.engine import HGMEngine
from hgm_v0_demo.metrics import EconomicSnapshot
from hgm_v0_demo.sentinel import Sentinel


def make_engine() -> HGMEngine:
    rng = random.Random(0)
    engine = HGMEngine(
        tau=1.0,
        alpha=1.2,
        epsilon=0.1,
        max_agents=10,
        max_expansions=5,
        max_evaluations=20,
        rng=rng,
    )
    engine.register_root(0.5)
    return engine


def test_sentinel_pauses_on_low_roi() -> None:
    engine = make_engine()
    sentinel = Sentinel(
        engine=engine,
        max_budget=100.0,
        min_roi=1.5,
        hard_budget_ratio=0.9,
        max_failures_per_agent=5,
        roi_recovery_steps=2,
    )
    snapshot = EconomicSnapshot(
        step=5,
        gmv=50.0,
        cost=60.0,
        successes=2,
        failures=3,
        roi=50.0 / 60.0,
        agents=[],
        best_agent_id=None,
    )
    sentinel.evaluate(snapshot)
    decision = sentinel.evaluate(snapshot)
    assert decision.pause_expansions is True
    assert engine.expansions_allowed is False


def test_sentinel_halts_on_budget_exhaustion() -> None:
    engine = make_engine()
    sentinel = Sentinel(
        engine=engine,
        max_budget=100.0,
        min_roi=1.0,
        hard_budget_ratio=0.9,
        max_failures_per_agent=5,
        roi_recovery_steps=2,
    )
    snapshot = EconomicSnapshot(
        step=5,
        gmv=10.0,
        cost=120.0,
        successes=1,
        failures=4,
        roi=10.0 / 120.0,
        agents=[],
        best_agent_id=None,
    )
    decision = sentinel.evaluate(snapshot)
    assert decision.halt_all is True
    assert engine.evaluations_allowed is False
