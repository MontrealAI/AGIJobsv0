from __future__ import annotations

import random

from hgm_demo.engine import EngineParameters, HGMEngine
from hgm_demo.sentinel import Sentinel, SentinelSettings
from hgm_demo.structures import AgentNode, EconomicLedger


def make_engine() -> HGMEngine:
    params = EngineParameters(tau=1.0, alpha=1.2, epsilon=0.05, max_agents=8, max_actions=50)
    engine = HGMEngine(params=params, rng=random.Random(42))
    root = AgentNode(agent_id="root", parent_id=None, depth=0, generation=0, quality=0.6)
    engine.register_root(root)
    return engine


def test_sentinel_toggles_expansion_on_roi_threshold() -> None:
    engine = make_engine()
    sentinel = Sentinel(SentinelSettings(min_roi=1.5, max_cost=10_000.0, max_failures_per_agent=5))
    ledger = EconomicLedger()
    ledger.record_failure(500.0)
    sentinel.evaluate(engine=engine, ledger=ledger)
    assert not engine.allow_expansions
    ledger.record_success(5000.0, 500.0)
    sentinel.evaluate(engine=engine, ledger=ledger)
    assert engine.allow_expansions


def test_sentinel_requests_halt_when_budget_exhausted() -> None:
    engine = make_engine()
    sentinel = Sentinel(SentinelSettings(min_roi=1.0, max_cost=200.0, max_failures_per_agent=5))
    ledger = EconomicLedger()
    ledger.record_failure(200.0)
    sentinel.evaluate(engine=engine, ledger=ledger)
    assert sentinel.halt_requested


def test_sentinel_prunes_agents_after_failure_streak() -> None:
    engine = make_engine()
    sentinel = Sentinel(SentinelSettings(min_roi=0.5, max_cost=10_000.0, max_failures_per_agent=2))
    child = AgentNode(agent_id="child", parent_id="root", depth=1, generation=1, quality=0.5)
    engine.register_child("root", child)
    engine.record_evaluation("child", False)
    engine.record_evaluation("child", False)
    sentinel.evaluate(engine=engine, ledger=EconomicLedger())
    assert "child" in engine.state.pruned_agents
