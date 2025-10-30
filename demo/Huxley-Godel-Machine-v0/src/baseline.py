"""Baseline greedy strategy for comparison."""
from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Dict, Tuple

from .entities import AgentNode, RunLedger
from .configuration import BaselineConfig, SimulationConfig
from .engine import SimulationEnvironment, clamp


@dataclass(slots=True)
class BaselineState:
    agents: Dict[str, AgentNode]
    ledger: RunLedger
    iterations: int


class GreedyBaseline:
    """Naïve strategy that expands and evaluates in a fixed cadence."""

    def __init__(
        self,
        config: BaselineConfig,
        simulation_config: SimulationConfig,
        rng: random.Random,
        root_quality: float,
        label: str,
    ) -> None:
        self.config = config
        self.rng = rng
        self.simulation = SimulationEnvironment(simulation_config, rng)
        root = AgentNode(
            identifier="baseline-0",
            parent_id=None,
            depth=0,
            label=label,
            description="Baseline agent",
            quality=root_quality,
        )
        self.state = BaselineState(agents={root.identifier: root}, ledger=RunLedger(), iterations=0)

    def run(self, max_iterations: int, cost_limit: float | None = None) -> BaselineState:
        while self.state.iterations < max_iterations:
            if self.state.iterations % self.config.expansion_interval == 0:
                self._expand()
            self._evaluate_batch()
            self.state.iterations += 1
            if cost_limit is not None and self.state.ledger.cost >= cost_limit:
                break
        return self.state

    def _expand(self) -> None:
        best = max(self.state.agents.values(), key=lambda node: node.success_rate)
        new_id = f"baseline-{len(self.state.agents)}"
        drift = self.rng.gauss(0.02, 0.08)
        quality = clamp(best.quality + drift, 0.05, 0.99)
        child = AgentNode(
            identifier=new_id,
            parent_id=best.identifier,
            depth=best.depth + 1,
            label=f"{best.label} :: Greedy",
            description="Greedy descendant",
            quality=quality,
        )
        self.state.agents[new_id] = child

    def _evaluate_batch(self) -> None:
        for _ in range(self.config.evaluation_batch):
            agent = max(self.state.agents.values(), key=lambda node: node.success_rate)
            success_probability = clamp(agent.quality, 0.05, 0.99)
            outcome, revenue, cost = self.simulation.evaluate(success_probability)
            agent.record_result(outcome)
            self.state.ledger.register(outcome, revenue, cost)


__all__ = ["GreedyBaseline", "BaselineState"]
