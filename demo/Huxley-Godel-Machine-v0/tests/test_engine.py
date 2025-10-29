from __future__ import annotations

import random

from hgm_demo.engine import ActionType, DecisionContext, HGMEngine


def make_engine(seed: int = 5) -> HGMEngine:
    rng = random.Random(seed)
    engine = HGMEngine(tau=1.1, alpha=1.3, epsilon=0.05, rng=rng)
    engine.register_root(quality=0.55, description="unit-test root")
    return engine


def test_clade_metrics_propagate_to_ancestors() -> None:
    engine = make_engine()
    child = engine.create_child(engine.root_id, quality=0.6)
    grandchild = engine.create_child(child.agent_id, quality=0.7)

    engine.record_evaluation(grandchild.agent_id, True)

    assert engine.get_agent(grandchild.agent_id).successes == 1
    assert engine.get_agent(child.agent_id).clade_successes == 1
    assert engine.get_agent(engine.root_id).clade_successes == 1


def test_next_action_prefers_expansion_initially() -> None:
    engine = make_engine()
    decision = engine.next_action(DecisionContext())
    assert decision is not None
    assert decision.action is ActionType.EXPAND


def test_best_agent_returns_high_performer() -> None:
    engine = make_engine()
    child = engine.create_child(engine.root_id, quality=0.8)
    for _ in range(6):
        engine.record_evaluation(child.agent_id, True)
    for _ in range(3):
        engine.record_evaluation(engine.root_id, False)
    winner = engine.best_agent()
    assert winner.agent_id == child.agent_id
