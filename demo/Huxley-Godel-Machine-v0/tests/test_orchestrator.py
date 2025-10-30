from __future__ import annotations

import asyncio
import random

import pytest

from hgm_demo.config import load_config
from hgm_demo.engine import HGMEngine
from hgm_demo.orchestrator import Orchestrator
from hgm_demo.simulation import ExpansionOutcome


class GuardedSimulator:
    """Simulator stub that records whether expansion methods were invoked."""

    def __init__(self) -> None:
        self.expand_called = False
        self.register_child_called = False

    async def expand(self, parent_id: str) -> ExpansionOutcome:
        self.expand_called = True
        return ExpansionOutcome(parent_id, 0.0, "stub", {})

    def register_child(self, child_id: str, parent_id: str, delta: float) -> None:
        self.register_child_called = True


class DummyPersistence:
    """Persistence stub that captures expansion records."""

    def __init__(self) -> None:
        self.expansions: list[tuple[str, str]] = []

    def start_run(self) -> None:  # pragma: no cover - orchestrator may not call during unit tests
        pass

    def finish_run(self, metrics) -> None:  # pragma: no cover - orchestrator may not call during unit tests
        pass

    def record_expansion(self, parent_id: str, child_id: str, generation: int, outcome: ExpansionOutcome) -> None:
        self.expansions.append((parent_id, child_id))

    def record_evaluation(self, agent_id: str, outcome) -> None:  # pragma: no cover - unused here
        pass

def test_maybe_expand_respects_budget_guard() -> None:
    config = load_config("demo/Huxley-Godel-Machine-v0/config/demo_agialpha.yml")
    engine = HGMEngine(
        tau=config.tau,
        alpha=config.alpha,
        epsilon=config.epsilon,
        max_expansions=config.max_expansions,
        max_evaluations=config.max_evaluations,
        rng=random.Random(config.seed),
    )
    engine.create_root()

    near_budget_cost = config.max_cost - config.expansion_cost + 1.0
    engine.metrics.cost = near_budget_cost

    simulator = GuardedSimulator()
    persistence = DummyPersistence()
    orchestrator = Orchestrator(engine, simulator, config, persistence)

    asyncio.run(orchestrator._maybe_expand())

    assert engine.metrics.cost == pytest.approx(near_budget_cost)
    assert engine.metrics.expansions == 0
    assert simulator.expand_called is False
    assert simulator.register_child_called is False
    assert persistence.expansions == []
