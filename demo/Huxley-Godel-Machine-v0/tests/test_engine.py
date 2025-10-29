from __future__ import annotations

import random

from hgm_demo.engine import EngineParameters, HGMEngine
from hgm_demo.structures import AgentNode


def make_engine(tau: float = 1.0, alpha: float = 1.2) -> HGMEngine:
    params = EngineParameters(tau=tau, alpha=alpha, epsilon=0.05, max_agents=8, max_actions=50)
    rng = random.Random(1234)
    engine = HGMEngine(params=params, rng=rng)
    root = AgentNode(agent_id="root", parent_id=None, depth=0, generation=0, quality=0.6)
    engine.register_root(root)
    return engine


def test_propagate_result_updates_clade() -> None:
    engine = make_engine()
    child = AgentNode(agent_id="child", parent_id="root", depth=1, generation=1, quality=0.7)
    engine.register_child("root", child)
    engine.record_evaluation("child", True)
    assert engine.get_agent("child").self_success == 1
    assert engine.get_agent("root").clade_success == engine.get_agent("root").self_success + 1


def test_next_action_prefers_expansion_until_budget() -> None:
    engine = make_engine(alpha=1.5)
    action = engine.next_action()
    assert action is not None
    assert action[0] == "expand"


def test_select_final_agent_returns_best_node() -> None:
    engine = make_engine()
    child = AgentNode(agent_id="child", parent_id="root", depth=1, generation=1, quality=0.9)
    engine.register_child("root", child)
    for _ in range(5):
        engine.record_evaluation("child", True)
    engine.record_evaluation("root", False)
    winner = engine.select_final_agent()
    assert winner is not None
    assert winner.agent_id == "child"
