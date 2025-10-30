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
