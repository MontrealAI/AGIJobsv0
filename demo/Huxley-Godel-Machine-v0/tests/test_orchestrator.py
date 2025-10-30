from __future__ import annotations

import asyncio
import random
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
    engine.metrics.cost = config.max_cost - 20.0

    simulator = Simulator(config, random.Random(config.seed + 1))
    orchestrator = Orchestrator(engine, simulator, config, DummyPersistence())
    orchestrator.sentinel.expansions_allowed = True

    asyncio.run(orchestrator._maybe_expand())

    assert engine.metrics.expansions == 0
    assert engine.metrics.cost == config.max_cost - 20.0
    assert len(list(engine.agents())) == 1
