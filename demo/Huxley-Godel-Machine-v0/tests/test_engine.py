from __future__ import annotations

import random
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from hgm_demo.engine import HGMEngine


def build_engine(seed: int = 7) -> HGMEngine:
    rng = random.Random(seed)
    engine = HGMEngine(tau=1.2, alpha=1.4, epsilon=0.05, max_expansions=5, max_evaluations=10, rng=rng)
    engine.create_root({"quality": 0.6})
    return engine


def test_expansion_creates_child_and_updates_tree() -> None:
    engine = build_engine()
    root = engine.get_agent("a1")
    child = engine.expansion_result(root.identifier, 0.1, {"note": "test"})

    assert child.parent_id == root.identifier
    assert child.generation == root.generation + 1
    assert child.identifier in root.children


def test_success_propagates_to_ancestors() -> None:
    engine = build_engine()
    root = engine.get_agent("a1")
    child = engine.expansion_result(root.identifier, 0.1, {})
    engine.evaluation_result(child.identifier, True, reward=1.0, cost=0.1)

    assert child.stats.successes == 1
    assert root.stats.clade_successes == 1


def test_final_agent_prefers_higher_success_rate() -> None:
    engine = build_engine()
    root = engine.get_agent("a1")
    child = engine.expansion_result(root.identifier, 0.1, {})
    for _ in range(5):
        engine.evaluation_result(child.identifier, True, reward=1.0, cost=0.1)
    for _ in range(5):
        engine.evaluation_result(root.identifier, False, reward=0.0, cost=0.1)

    assert engine.final_agent() == child
