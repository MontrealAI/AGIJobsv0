from __future__ import annotations

import random
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))
from hgm_v0_demo.engine import HGMEngine


def test_clade_updates_propagate_to_root() -> None:
    rng = random.Random(42)
    engine = HGMEngine(
        tau=1.0,
        alpha=1.2,
        epsilon=0.1,
        max_agents=10,
        max_expansions=5,
        max_evaluations=20,
        rng=rng,
    )
    root = engine.register_root(0.5)
    child = engine.complete_expansion(root.agent_id, 0.6)
    engine.record_evaluation(child.agent_id, success=True)
    assert root.clade_success == 1
    assert child.clade_success == 1
    assert child.direct_success == 1


def test_best_agent_prefers_higher_success_rate() -> None:
    rng = random.Random(99)
    engine = HGMEngine(
        tau=1.0,
        alpha=1.2,
        epsilon=0.1,
        max_agents=10,
        max_expansions=5,
        max_evaluations=20,
        rng=rng,
    )
    root = engine.register_root(0.5)
    child = engine.complete_expansion(root.agent_id, 0.7)
    for _ in range(5):
        engine.record_evaluation(child.agent_id, success=True)
    engine.record_evaluation(root.agent_id, success=False)
    assert engine.best_agent() == child
