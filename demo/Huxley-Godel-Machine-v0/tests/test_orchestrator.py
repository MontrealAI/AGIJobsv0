from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from types import SimpleNamespace

from hgm_demo.config import load_config
from hgm_demo.engine import HGMEngine
from hgm_demo.orchestrator import Orchestrator


@dataclass
class DummyPersistence:
    def start_run(self) -> None:  # pragma: no cover - noop for tests
        pass

    def finish_run(self, metrics) -> None:  # pragma: no cover - noop for tests
        pass

    def record_expansion(self, *args, **kwargs) -> None:  # pragma: no cover - noop for tests
        pass

    def record_evaluation(self, *args, **kwargs) -> None:  # pragma: no cover - noop for tests
        pass


class RecordingSimulator:
    def __init__(self) -> None:
        self.expansions_requested = 0

    async def expand(self, parent_id: str):  # pragma: no cover - should not run
        self.expansions_requested += 1
        return SimpleNamespace(quality_delta=0.1, metadata={})

    def register_child(self, child_id: str, parent_id: str, delta: float) -> None:  # pragma: no cover - noop
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
        rng=random.Random(1234),
    )
    engine.create_root({"quality": 0.8})

    engine.metrics.cost = config.max_cost - (config.expansion_cost - 1)

    simulator = RecordingSimulator()
    orchestrator = Orchestrator(engine, simulator, config, DummyPersistence())

    asyncio.run(orchestrator._maybe_expand())

    assert simulator.expansions_requested == 0
    assert engine.metrics.expansions == 0
        rng=random.Random(config.seed),
    )
    engine.create_root({"quality": 0.6})
    engine.metrics.cost = config.max_cost - 20.0

    simulator = Simulator(config, random.Random(config.seed + 1))
    orchestrator = Orchestrator(engine, simulator, config, DummyPersistence())
    orchestrator.sentinel.expansions_allowed = True

    asyncio.run(orchestrator._maybe_expand())

    assert engine.metrics.expansions == 0
    assert engine.metrics.cost == config.max_cost - 20.0
    assert len(list(engine.agents())) == 1
