"""Stochastic simulation environment for the HGM demo."""
from __future__ import annotations

import asyncio
import itertools
import random
from dataclasses import dataclass
from typing import Dict, Tuple

from .structures import AgentNode, EconomicLedger


@dataclass
class EconomicModel:
    success_value: float
    failure_cost: float
    expansion_cost: float


class SimulationEnvironment:
    """Encapsulates stochastic behaviour for expansions and evaluations."""

    def __init__(
        self,
        rng: random.Random,
        economic_model: EconomicModel,
        quality_sigma: float,
        quality_bounds: Tuple[float, float],
        baseline_quality_drift: float,
        innovation_bias: float,
        evaluation_latency: Tuple[float, float],
        expansion_latency: Tuple[float, float],
    ) -> None:
        self.rng = rng
        self.economic_model = economic_model
        self.quality_sigma = quality_sigma
        self.quality_bounds = quality_bounds
        self.baseline_quality_drift = baseline_quality_drift
        self.evaluation_latency = evaluation_latency
        self.expansion_latency = expansion_latency
        self.innovation_bias = innovation_bias
        self._id_counter = itertools.count(1)
        self.hidden_quality: Dict[str, float] = {}

    def _make_agent_id(self) -> str:
        return f"agent-{next(self._id_counter):03d}"

    def create_root(self, name: str, quality: float, prior_successes: int, prior_failures: int) -> AgentNode:
        agent_id = self._make_agent_id()
        node = AgentNode(
            agent_id=agent_id,
            parent_id=None,
            depth=0,
            generation=0,
            quality=quality,
            clade_success=prior_successes,
            clade_failure=prior_failures,
            self_success=prior_successes,
            self_failure=prior_failures,
            metadata={"label": name},
        )
        self.hidden_quality[agent_id] = quality
        return node

    async def expand(self, parent: AgentNode) -> Tuple[AgentNode, EconomicLedger]:
        await asyncio.sleep(self.rng.uniform(*self.expansion_latency))
        delta = self.rng.gauss(0.0, self.quality_sigma)
        trend = self.rng.uniform(-self.baseline_quality_drift, self.baseline_quality_drift)
        new_quality = parent.quality + delta + trend + self.innovation_bias
        low, high = self.quality_bounds
        new_quality = max(low, min(high, new_quality))
        child_id = self._make_agent_id()
        node = AgentNode(
            agent_id=child_id,
            parent_id=parent.agent_id,
            depth=parent.depth + 1,
            generation=parent.generation + 1,
            quality=new_quality,
            metadata={"mutation": delta, "trend": trend},
        )
        self.hidden_quality[child_id] = new_quality
        ledger = EconomicLedger()
        ledger.record_failure(self.economic_model.expansion_cost)
        return node, ledger

    async def evaluate(self, agent: AgentNode) -> Tuple[bool, EconomicLedger]:
        await asyncio.sleep(self.rng.uniform(*self.evaluation_latency))
        success_probability = self.hidden_quality[agent.agent_id]
        success = self.rng.random() < success_probability
        ledger = EconomicLedger()
        if success:
            ledger.record_success(self.economic_model.success_value, self.economic_model.failure_cost)
        else:
            ledger.record_failure(self.economic_model.failure_cost)
        return success, ledger

    def clone_for_baseline(self) -> "SimulationEnvironment":
        clone = SimulationEnvironment(
            rng=self.rng,
            economic_model=self.economic_model,
            quality_sigma=self.quality_sigma,
            quality_bounds=self.quality_bounds,
            baseline_quality_drift=self.baseline_quality_drift,
            innovation_bias=self.innovation_bias,
            evaluation_latency=self.evaluation_latency,
            expansion_latency=self.expansion_latency,
        )
        clone._id_counter = itertools.count(next(self._id_counter))
        clone.hidden_quality = dict(self.hidden_quality)
        return clone
