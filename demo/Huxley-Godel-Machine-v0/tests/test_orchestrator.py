from __future__ import annotations

import asyncio
import random

from hgm_demo.config import load_config
from hgm_demo.engine import HGMEngine
from hgm_demo.orchestrator import Orchestrator


class DummySimulator:
    expand_called: bool

    def __init__(self) -> None:
        self.expand_called = False

    async def expand(self, parent_id: str):  # pragma: no cover - should not be called
        self.expand_called = True
        raise AssertionError("expand should not be invoked when the budget is exhausted")

    def register_child(self, child_id: str, parent_id: str, delta: float) -> None:  # pragma: no cover
        raise AssertionError("register_child should not be invoked when the budget is exhausted")


class DummyPersistence:
    def start_run(self) -> None:  # pragma: no cover - not used
        pass

    def finish_run(self, metrics) -> None:  # pragma: no cover - not used
        pass

    def record_expansion(self, parent_id, child_id, generation, outcome) -> None:  # pragma: no cover
        raise AssertionError("record_expansion should not be invoked when the budget is exhausted")

    def record_evaluation(self, agent_id, outcome) -> None:  # pragma: no cover
        pass


def test_orchestrator_skips_expansion_when_budget_insufficient() -> None:
    config = load_config("demo/Huxley-Godel-Machine-v0/config/demo_agialpha.yml")
    engine = HGMEngine(
        tau=config.tau,
        alpha=config.alpha,
        epsilon=config.epsilon,
        max_expansions=config.max_expansions,
        max_evaluations=config.max_evaluations,
        rng=random.Random(config.seed),
    )
    engine.create_root({"quality": 0.6})

    simulator = DummySimulator()
    orchestrator = Orchestrator(engine, simulator, config, DummyPersistence())

    original_cost = config.max_cost - config.expansion_cost + 1
    engine.metrics.cost = original_cost

    asyncio.run(orchestrator._maybe_expand())

    assert engine.metrics.expansions == 0
    assert engine.metrics.cost == original_cost
    assert simulator.expand_called is False
