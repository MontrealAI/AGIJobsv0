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
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from hgm_demo.config import DemoConfig
from hgm_demo.engine import HGMEngine
from hgm_demo.orchestrator import Orchestrator
from hgm_demo.simulation import Simulator


class DummyPersistence:
    def start_run(self) -> None:  # pragma: no cover - not used in this test
        pass

    def finish_run(self, metrics) -> None:  # pragma: no cover - not used in this test
        pass

    def record_expansion(self, *args, **kwargs) -> None:
        raise AssertionError("expansion should not be recorded when over budget")

    def record_evaluation(self, *args, **kwargs) -> None:  # pragma: no cover - not used in this test
        pass


def test_expansion_skipped_when_projected_cost_exceeds_budget() -> None:
    config = DemoConfig(
        seed=123,
        total_iterations=5,
        max_expansions=3,
        max_evaluations=3,
        tau=1.1,
        alpha=1.3,
        epsilon=0.05,
        concurrency=1,
        thermostat_interval=5,
        roi_target=2.0,
        roi_floor=1.0,
        max_cost=2500.0,
        max_failures_per_agent=5,
        expansion_cost=75.0,
        evaluation_cost=10.0,
        success_reward=100.0,
        baseline_eagerness=0.25,
        concurrency_bounds=(1, 4),
    )
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
    engine.metrics.cost = config.max_cost - 20.0

    simulator = Simulator(config, random.Random(config.seed + 1))
    orchestrator = Orchestrator(engine, simulator, config, DummyPersistence())
    orchestrator.sentinel.expansions_allowed = True

    asyncio.run(orchestrator._maybe_expand())

    assert engine.metrics.expansions == 0
    assert engine.metrics.cost == original_cost
    assert simulator.expand_called is False
    assert engine.metrics.cost == config.max_cost - 20.0
    assert len(list(engine.agents())) == 1
