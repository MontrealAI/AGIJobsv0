"""High level helpers for running the HGM demo simulations.

This module exposes two distinct entry points:

``run_hgm_simulation``
    Executes the flagship CMP-guided strategy using the asynchronous
    :class:`~hgm_demo.orchestrator.DemoOrchestrator`.

``run_baseline_simulation``
    Runs a deliberately simplistic greedy baseline used for comparison in the
    CLI demo.

In addition, the module now provides a lightweight
:class:`SimulationEnvironment` that is used both by the greedy baseline and by
the CLI runner to model economic effects such as latency, costs, and quality
drift.
"""
from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass, field
import random
from typing import Dict, List, Tuple

from .engine import HGMEngine
from .metrics import RunMetrics
from .orchestrator import DemoOrchestrator
from .structures import AgentNode
from .visualization import lineage_mermaid_diagram


@dataclass
class EconomicModel:
    """Encapsulates the economic assumptions for the simulation."""

    success_value: float
    failure_cost: float
    expansion_cost: float


@dataclass
class EconomicDelta:
    """Represents the delta applied to an :class:`EconomicLedger`."""

    gmv: float = 0.0
    cost: float = 0.0


class SimulationEnvironment:
    """Stochastic environment driving agent expansions and evaluations.

    The environment keeps track of the lineage tree that the baseline strategy
    interacts with, applying configurable quality drift and stochastic
    latencies to mimic the demo experience exposed by the orchestrator.
    """

    def __init__(
        self,
        *,
        rng: random.Random,
        economic_model: EconomicModel,
        quality_sigma: float,
        quality_bounds: Tuple[float, float],
        baseline_quality_drift: float,
        innovation_bias: float,
        evaluation_latency: Tuple[float, float],
        expansion_latency: Tuple[float, float],
    ) -> None:
        self._rng = rng
        self._economic_model = economic_model
        self._quality_sigma = max(0.0, quality_sigma)
        self._quality_bounds = (
            min(quality_bounds[0], quality_bounds[1]),
            max(quality_bounds[0], quality_bounds[1]),
        )
        self._baseline_quality_drift = max(0.0, baseline_quality_drift)
        self._innovation_bias = innovation_bias
        self._evaluation_latency = evaluation_latency
        self._expansion_latency = expansion_latency
        self._agents: Dict[str, AgentNode] = {}
        self._id_counter = 0

    # ------------------------------------------------------------------
    # Agent management helpers
    # ------------------------------------------------------------------
    def _next_agent_id(self) -> str:
        self._id_counter += 1
        return f"agent-{self._id_counter}"

    def _clamp_quality(self, quality: float) -> float:
        low, high = self._quality_bounds
        return max(low, min(high, quality))

    def _sample_latency(self, bounds: Tuple[float, float]) -> float:
        low, high = bounds
        if high < low:
            low, high = high, low
        if math.isclose(low, high):
            return max(0.0, low)
        return max(0.0, self._rng.uniform(low, high))

    def _record_clade_result(self, node: AgentNode, success: bool) -> None:
        parent_id = node.parent_id
        while parent_id is not None:
            parent = self._agents[parent_id]
            if success:
                parent.clade_success += 1
            else:
                parent.clade_failure += 1
            parent_id = parent.parent_id

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def create_root(
        self,
        *,
        name: str,
        quality: float,
        prior_successes: int,
        prior_failures: int,
    ) -> AgentNode:
        agent = AgentNode(
            agent_id=self._next_agent_id(),
            parent_id=None,
            depth=0,
            quality=self._clamp_quality(quality),
            clade_success=max(0, prior_successes),
            clade_failure=max(0, prior_failures),
            self_success=max(0, prior_successes),
            self_failure=max(0, prior_failures),
            generation=0,
            metadata={"name": name},
        )
        self._agents[agent.agent_id] = agent
        return agent

    async def expand(self, parent: AgentNode) -> tuple[AgentNode, EconomicDelta]:
        await asyncio.sleep(self._sample_latency(self._expansion_latency))
        mutation = self._rng.gauss(self._innovation_bias, self._quality_sigma)
        child_quality = self._clamp_quality(parent.quality + mutation)
        child = AgentNode(
            agent_id=self._next_agent_id(),
            parent_id=parent.agent_id,
            depth=parent.depth + 1,
            quality=child_quality,
            generation=parent.generation + 1,
            metadata={"name": f"Derivative of {parent.agent_id}"},
        )
        self._agents[child.agent_id] = child
        return child, EconomicDelta(cost=self._economic_model.expansion_cost)

    async def evaluate(self, agent: AgentNode) -> tuple[bool, EconomicDelta]:
        await asyncio.sleep(self._sample_latency(self._evaluation_latency))
        success_probability = max(0.01, min(0.99, agent.quality))
        success = self._rng.random() < success_probability

        if success:
            agent.self_success += 1
            agent.clade_success += 1
            agent.quality = self._clamp_quality(
                agent.quality + self._baseline_quality_drift
            )
        else:
            agent.self_failure += 1
            agent.clade_failure += 1
            agent.quality = self._clamp_quality(
                agent.quality - self._baseline_quality_drift
            )

        self._record_clade_result(agent, success)

        if success:
            generation_bonus = 1.0 + 0.12 * agent.generation
            cadence_bonus = 1.0 + 0.05 * agent.success_rate
            gmv = self._economic_model.success_value * generation_bonus * cadence_bonus
        else:
            gmv = 0.0

        delta = EconomicDelta(gmv=gmv, cost=self._economic_model.failure_cost)
        return success, delta




@dataclass
class StrategyOutcome:
    name: str
    metrics: RunMetrics
    log: List[str] = field(default_factory=list)
    mermaid: str | None = None

    @property
    def summary(self) -> str:
        roi = "∞" if self.metrics.total_cost == 0 else f"{self.metrics.roi:.2f}"
        return (
            f"{self.name}: GMV=${self.metrics.total_gmv:.2f} | Cost=${self.metrics.total_cost:.2f} | "
            f"Profit=${self.metrics.profit:.2f} | ROI={roi}"
        )


@dataclass
class DemoComparison:
    hgm: StrategyOutcome
    baseline: StrategyOutcome

    @property
    def lift_percentage(self) -> float:
        if self.baseline.metrics.total_gmv == 0:
            return float("inf")
        return ((self.hgm.metrics.total_gmv - self.baseline.metrics.total_gmv) / self.baseline.metrics.total_gmv) * 100


async def _run_hgm_async(seed: int, actions: int) -> StrategyOutcome:
    log_messages: List[str] = []

    def logger(message: str) -> None:
        log_messages.append(message)

    engine_rng = random.Random(seed)
    orchestrator_rng = random.Random(seed + 1)

    engine = HGMEngine(tau=1.1, alpha=1.25, epsilon=0.05, rng=engine_rng)
    engine.register_root(quality=0.58, description="Day-zero AGIJobs operator harnessing HGM")

    orchestrator = DemoOrchestrator(engine, rng=orchestrator_rng)
    await orchestrator.run(max_actions=actions, log=logger)

    mermaid = lineage_mermaid_diagram(engine)
    return StrategyOutcome(
        name="HGM CMP-guided",
        metrics=orchestrator.metrics,
        log=log_messages,
        mermaid=mermaid,
    )


def run_hgm_simulation(seed: int, actions: int) -> StrategyOutcome:
    return asyncio.run(_run_hgm_async(seed, actions))


def run_baseline_simulation(seed: int, actions: int) -> StrategyOutcome:
    rng = random.Random(seed)
    metrics = RunMetrics()
    quality = 0.52
    log_messages: List[str] = []
    base_value = 70.0
    for step in range(actions):
        success = rng.random() < quality
        if success:
            gmv = base_value * (1.0 + 0.03 * (step + 1))
            quality = min(0.88, quality + 0.005)
        else:
            gmv = 0.0
            quality = max(0.35, quality - 0.03)
        metrics.record_evaluation("baseline", success, gmv=gmv, cost=15.0)
        if success:
            log_messages.append(
                f"✅ Baseline success (step {step}) :: gmv=${gmv:.2f} quality→{quality:.2f}"
            )
        else:
            log_messages.append(
                f"❌ Baseline miss   (step {step}) :: cost=$15.00 quality→{quality:.2f}"
            )
    return StrategyOutcome(name="Greedy baseline", metrics=metrics, log=log_messages, mermaid=None)


def run_comparison(seed: int = 7, actions: int = 42) -> DemoComparison:
    hgm = run_hgm_simulation(seed, actions)
    baseline = run_baseline_simulation(seed, actions)
    return DemoComparison(hgm=hgm, baseline=baseline)


__all__ = [
    "DemoComparison",
    "EconomicDelta",
    "EconomicModel",
    "SimulationEnvironment",
    "StrategyOutcome",
    "run_baseline_simulation",
    "run_comparison",
    "run_hgm_simulation",
]
