"""Implementation of the simplified HGM engine used in the demo."""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

from .entities import AgentNode, DemoSnapshot, RunLedger
from .configuration import (
    DemoConfiguration,
    HGMConfig,
    SimulationConfig,
)


@dataclass(slots=True)
class EngineDecision:
    action: str  # "expand" or "evaluate"
    agent_id: str
    parent_id: Optional[str] = None


class HGMEngine:
    """Simplified yet faithful implementation of Algorithm 1 for the demo."""

    def __init__(
        self,
        config: DemoConfiguration,
        rng: random.Random,
        simulation_hook: "SimulationEnvironment",
    ) -> None:
        self.config = config
        self.hgm_config = HGMConfig(
            tau=config.hgm.tau,
            alpha=config.hgm.alpha,
            epsilon=config.hgm.epsilon,
            max_concurrency=config.hgm.max_concurrency,
            min_concurrency=config.hgm.min_concurrency,
            warmup_iterations=config.hgm.warmup_iterations,
            allow_expansions=config.hgm.allow_expansions,
        )
        self.sim_config: SimulationConfig = config.simulation
        self.rng = rng
        self.simulation = simulation_hook

        self.nodes: Dict[str, AgentNode] = {}
        self.root_id: Optional[str] = None
        self.iteration: int = 0
        self.total_expansions: int = 0
        self.total_evaluations: int = 0
        self.pending_agents: Dict[str, str] = {}
        self.ledger = RunLedger()
        self.concurrency_limit = self.hgm_config.min_concurrency
        self.expansion_cooldown = 0

    # ------------------------------------------------------------------
    # Agent lifecycle
    # ------------------------------------------------------------------
    def seed_root(self, label: str, description: str, quality: float) -> AgentNode:
        identifier = "agent-0"
        node = AgentNode(
            identifier=identifier,
            parent_id=None,
            depth=0,
            label=label,
            description=description,
            quality=quality,
        )
        self.nodes[identifier] = node
        self.root_id = identifier
        return node

    def expand_agent(self, parent_id: str) -> AgentNode:
        parent = self.nodes[parent_id]
        new_id = f"agent-{len(self.nodes)}"
        drift = self.rng.gauss(
            self.sim_config.quality_drift_mean, self.sim_config.quality_drift_stddev
        )
        quality = clamp(
            parent.quality + drift,
            self.sim_config.min_quality,
            self.sim_config.max_quality,
        )
        child = AgentNode(
            identifier=new_id,
            parent_id=parent_id,
            depth=parent.depth + 1,
            label=f"{parent.label} :: Δ{len(parent.notes) + 1}",
            description="Autonomously refined descendant leveraging CMP-guided search.",
            quality=quality,
        )
        parent.notes.append(
            f"Expanded to {new_id} with quality shift {quality - parent.quality:.3f}"
        )
        self.nodes[new_id] = child
        self.total_expansions += 1
        self.expansion_cooldown = self.config.sentinel.cooldown_iterations
        return child

    def evaluate_agent(self, agent_id: str) -> Tuple[bool, float, float]:
        agent = self.nodes[agent_id]
        concurrency_penalty = max(0.0, self.concurrency_limit - 1) * self.sim_config.concurrency_penalty
        success_probability = clamp(agent.quality - concurrency_penalty, 0.01, 0.99)
        success, revenue, cost = self.simulation.evaluate(success_probability)
        agent.record_result(success)
        for ancestor in self._ancestors(agent_id):
            ancestor.record_clade_result(success)
        self.total_evaluations += 1
        self.ledger.register(success, revenue, cost)
        return success, revenue, cost

    # ------------------------------------------------------------------
    # Decision logic
    # ------------------------------------------------------------------
    def next_decision(self) -> Optional[EngineDecision]:
        if self.iteration >= self.config.budget.max_iterations:
            return None
        if self.ledger.cost >= self.config.budget.max_cost:
            return None

        expandable = [node for node in self.nodes.values() if not node.is_pruned]
        if not expandable:
            return None

        action = self._choose_action()
        if action == "expand":
            candidate_id = self._sample_for_expansion(expandable)
            if candidate_id is None:
                action = "evaluate"
            else:
                return EngineDecision(action="expand", agent_id=candidate_id)

        if action == "evaluate":
            candidate_id = self._sample_for_evaluation(expandable)
            if candidate_id is None:
                return None
            return EngineDecision(action="evaluate", agent_id=candidate_id)
        return None

    def _choose_action(self) -> str:
        if not self.hgm_config.allow_expansions:
            return "evaluate"
        if self.expansion_cooldown > 0:
            self.expansion_cooldown -= 1
            return "evaluate"

        num_agents = len(self.nodes)
        if num_agents == 0:
            return "expand"
        if self.total_evaluations == 0:
            return "evaluate"

        if num_agents <= max(1, int(math.pow(self.total_evaluations, 1 / max(self.hgm_config.alpha, 1e-6)))):
            return "expand"
        return "evaluate"

    def _sample_for_expansion(self, agents: Iterable[AgentNode]) -> Optional[str]:
        scored: List[Tuple[float, str]] = []
        for agent in agents:
            if agent.is_pruned:
                continue
            a = max(agent.clade_successes, 0) + 1
            b = max(agent.clade_failures, 0) + 1
            score = self.rng.betavariate(self.hgm_config.tau * a, self.hgm_config.tau * b)
            scored.append((score, agent.identifier))
        if not scored:
            return None
        scored.sort(reverse=True, key=lambda item: item[0])
        return scored[0][1]

    def _sample_for_evaluation(self, agents: Iterable[AgentNode]) -> Optional[str]:
        scored: List[Tuple[float, str]] = []
        for agent in agents:
            if agent.is_pruned:
                continue
            a = agent.successes + 1
            b = agent.failures + 1
            score = self.rng.betavariate(self.hgm_config.tau * a, self.hgm_config.tau * b)
            scored.append((score, agent.identifier))
        if not scored:
            return None
        scored.sort(reverse=True, key=lambda item: item[0])
        return scored[0][1]

    def best_agent(self) -> Optional[AgentNode]:
        if not self.nodes:
            return None
        epsilon = clamp(self.config.hgm.epsilon, 0.0, 0.5)
        best_node = None
        best_score = -1.0
        for node in self.nodes.values():
            a = node.successes + 1
            b = node.failures + 1
            score = beta_percentile(a, b, epsilon)
            if score > best_score:
                best_score = score
                best_node = node
        return best_node

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------
    def _ancestors(self, agent_id: str) -> Iterable[AgentNode]:
        current = self.nodes[agent_id]
        while current.parent_id is not None:
            current = self.nodes[current.parent_id]
            yield current

    def record_snapshot(self) -> DemoSnapshot:
        best = self.best_agent()
        snapshot = DemoSnapshot(
            iteration=self.iteration,
            active_agents=sum(1 for node in self.nodes.values() if not node.is_pruned),
            total_expansions=self.total_expansions,
            total_evaluations=self.total_evaluations,
            gmv=self.ledger.gmv,
            cost=self.ledger.cost,
            roi=self.ledger.roi,
            best_agent_id=best.identifier if best else "n/a",
        )
        self.ledger.history.append(snapshot)
        return snapshot

    def increment_iteration(self) -> None:
        self.iteration += 1

    def update_concurrency(self, limit: int) -> None:
        self.concurrency_limit = max(self.hgm_config.min_concurrency, min(limit, self.hgm_config.max_concurrency))


class SimulationEnvironment:
    """Encapsulates the economic simulation used by the demo."""

    def __init__(self, config: SimulationConfig, rng: random.Random) -> None:
        self.config = config
        self.rng = rng

    def evaluate(self, success_probability: float) -> Tuple[bool, float, float]:
        outcome = self.rng.random() <= success_probability
        revenue = self.config.success_value if outcome else 0.0
        return outcome, revenue, self.config.base_task_cost


# ----------------------------------------------------------------------
# Statistical helpers
# ----------------------------------------------------------------------

def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def beta_percentile(alpha: int, beta_param: int, percentile: float) -> float:
    """Compute the given percentile of a Beta distribution using inversion."""
    if percentile <= 0:
        return 0.0
    if percentile >= 1:
        return 1.0
    # Use simple binary search since scipy is not guaranteed to be available.
    low, high = 0.0, 1.0
    for _ in range(40):
        mid = (low + high) / 2
        cdf = _beta_cdf(mid, alpha, beta_param)
        if cdf < percentile:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def _beta_cdf(x: float, alpha: int, beta_param: int) -> float:
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    # Use incomplete beta via continued fraction approximation.
    return _betainc(alpha, beta_param, x)


def _betainc(a: int, b: int, x: float) -> float:
    # Adapted from Numerical Recipes' implementation of the incomplete beta function.
    MAX_ITERS = 200
    EPS = 3e-9
    am, bm = 1.0, 1.0
    az = 1.0
    qab = a + b
    qap = a + 1
    qam = a - 1
    bz = 1.0 - qab * x / qap
    for m in range(1, MAX_ITERS + 1):
        em = float(m)
        tem = em + em
        d = em * (b - em) * x / ((qam + tem) * (a + tem))
        ap = az + d * am
        bp = bz + d * bm
        d = -(a + em) * (qab + em) * x / ((a + tem) * (qap + tem))
        app = ap + d * az
        bpp = bp + d * bz
        aold = az
        am, bm = az, bz
        az, bz = app, bpp
        if abs(az - aold) < EPS * abs(az):
            break
    prefactor = math.exp(
        a * math.log(x)
        + b * math.log(1 - x)
        - math.log(a)
        - math.lgamma(a + b)
        + math.lgamma(a)
        + math.lgamma(b)
    )
    return prefactor * az


__all__ = [
    "HGMEngine",
    "SimulationEnvironment",
    "EngineDecision",
    "clamp",
    "beta_percentile",
]
