from __future__ import annotations

import random

from hgm_demo.config import load_config
from hgm_demo.engine import HGMEngine
from hgm_demo.sentinel import Sentinel


def make_engine() -> HGMEngine:
    rng = random.Random(1)
    engine = HGMEngine(tau=1.0, alpha=1.3, epsilon=0.05, max_expansions=5, max_evaluations=10, rng=rng)
    engine.create_root({"quality": 0.6})
    return engine


def test_sentinel_prunes_after_failures() -> None:
    config = load_config("demo/Huxley-Godel-Machine-v0/config/demo_agialpha.yml")
    engine = make_engine()
    sentinel = Sentinel(config, engine)
    agent = engine.get_agent("a1")
    for _ in range(config.max_failures_per_agent):
        engine.evaluation_result(agent.identifier, False, 0.0, config.evaluation_cost)
        sentinel.observe(type("Outcome", (), {"agent_id": agent.identifier, "success": False})())
    assert engine.get_agent("a1").pruned is True


def test_sentinel_blocks_expansion_on_low_roi() -> None:
    config = load_config("demo/Huxley-Godel-Machine-v0/config/demo_agialpha.yml")
    engine = make_engine()
    sentinel = Sentinel(config, engine)
    engine.metrics.cost = config.max_cost + 1
    sentinel.enforce(1, None)
    assert sentinel.expansions_allowed is False


def test_sentinel_blocks_expansion_when_budget_insufficient() -> None:
    config = load_config("demo/Huxley-Godel-Machine-v0/config/demo_agialpha.yml")
    engine = make_engine()
    sentinel = Sentinel(config, engine)
    engine.metrics.cost = config.max_cost - config.expansion_cost + 1
    sentinel.enforce(1, None)
    assert sentinel.expansions_allowed is False
