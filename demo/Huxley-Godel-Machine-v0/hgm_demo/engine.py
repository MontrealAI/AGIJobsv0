"""Core HGM engine implementing Algorithm 1 from the paper."""

from __future__ import annotations

import itertools
import math
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from .models import AgentNode, AgentStats


@dataclass(slots=True)
class EngineMetrics:
    """Aggregate metrics tracked across the full run."""

    expansions: int = 0
    evaluations: int = 0
    successes: int = 0
    failures: int = 0
    cost: float = 0.0
    gmv: float = 0.0

    @property
    def roi(self) -> float:
        if self.cost == 0:
            return float("inf")
        return self.gmv / self.cost


@dataclass(slots=True)
class PendingAction:
    """Represents the next action the engine would like the orchestrator to perform."""

    action: str  # "expand" or "evaluate"
    agent_id: str
    parent_id: Optional[str] = None


class HGMEngine:
    """Implements the control logic of the Huxley–Gödel Machine."""

    def __init__(
        self,
        *,
        tau: float,
        alpha: float,
        epsilon: float,
        max_expansions: int,
        max_evaluations: int,
        rng: random.Random,
    ) -> None:
        if tau <= 0:
            raise ValueError("tau must be positive")
        if alpha <= 0:
            raise ValueError("alpha must be positive")

        self.tau = tau
        self.alpha = alpha
        self.epsilon = epsilon
        self.max_expansions = max_expansions
        self.max_evaluations = max_evaluations
        self._rng = rng

        self.metrics = EngineMetrics()
        self._agents: Dict[str, AgentNode] = {}
        self._root_id: Optional[str] = None
        self._id_counter = itertools.count(1)

    # ------------------------------------------------------------------
    # Agent management helpers
    # ------------------------------------------------------------------
    def create_root(self, metadata: Optional[Dict[str, float]] = None) -> AgentNode:
        identifier = self._allocate_id()
        root = AgentNode(identifier=identifier, parent_id=None, generation=0, metadata=metadata or {})
        self._agents[identifier] = root
        self._root_id = identifier
        return root

    def _allocate_id(self) -> str:
        return f"a{next(self._id_counter)}"

    def get_agent(self, agent_id: str) -> AgentNode:
        return self._agents[agent_id]

    def agents(self) -> Iterable[AgentNode]:
        return self._agents.values()

    def choose_evaluation_agent(self) -> Optional[AgentNode]:
        return self._sample_agent_for_evaluation()

    def choose_expansion_agent(self) -> Optional[AgentNode]:
        return self._sample_agent_for_expansion()

    # ------------------------------------------------------------------
    # Decision making
    # ------------------------------------------------------------------
    def next_action(self) -> Optional[PendingAction]:
        """Determine the next action to request from the orchestrator."""

        if self.metrics.expansions >= self.max_expansions and self.metrics.evaluations >= self.max_evaluations:
            return None

        should_expand = self._should_expand()
        if should_expand and self.metrics.expansions < self.max_expansions:
            candidate = self._sample_agent_for_expansion()
            if candidate is not None:
                candidate.mark_busy(True)
                return PendingAction("expand", candidate.identifier)

        if self.metrics.evaluations < self.max_evaluations:
            candidate = self._sample_agent_for_evaluation()
            if candidate is not None:
                candidate.mark_busy(True)
                return PendingAction("evaluate", candidate.identifier)

        return None

    # Thompson sampling -------------------------------------------------
    def _sample_agent_for_expansion(self) -> Optional[AgentNode]:
        expandable = [agent for agent in self._agents.values() if not agent.busy and not agent.pruned]
        if not expandable:
            return None

        best_agent = None
        best_sample = -1.0
        for agent in expandable:
            stats = agent.stats
            successes = stats.clade_successes + 1
            failures = stats.clade_failures + 1
            sample = self._rng.betavariate(self.tau * successes, self.tau * failures)
            if sample > best_sample:
                best_agent = agent
                best_sample = sample
        return best_agent

    def _sample_agent_for_evaluation(self) -> Optional[AgentNode]:
        selectable = [agent for agent in self._agents.values() if not agent.busy and not agent.pruned]
        if not selectable:
            return None

        best_agent = None
        best_sample = -1.0
        for agent in selectable:
            stats = agent.stats
            successes = stats.successes + 1
            failures = stats.failures + 1
            sample = self._rng.betavariate(self.tau * successes, self.tau * failures)
            if sample > best_sample:
                best_agent = agent
                best_sample = sample
        return best_agent

    def _should_expand(self) -> bool:
        agent_count = len(self._agents)
        evals = max(1, self.metrics.evaluations)
        limit = math.pow(evals, 1 / self.alpha)
        return agent_count <= limit

    # ------------------------------------------------------------------
    # Callbacks from orchestrator
    # ------------------------------------------------------------------
    def expansion_result(self, parent_id: str, quality_delta: float, metadata: Optional[Dict[str, float]] = None) -> AgentNode:
        parent = self._agents[parent_id]
        parent.mark_busy(False)
        child_id = self._allocate_id()
        child_metadata = dict(parent.metadata)
        child_metadata.update(metadata or {})
        child_metadata["quality_delta"] = quality_delta
        child = AgentNode(identifier=child_id, parent_id=parent_id, generation=parent.generation + 1, metadata=child_metadata)
        self._agents[child_id] = child
        parent.children.append(child_id)
        self.metrics.expansions += 1
        return child

    def evaluation_result(self, agent_id: str, success: bool, reward: float, cost: float) -> None:
        agent = self._agents[agent_id]
        agent.mark_busy(False)
        self.metrics.evaluations += 1
        self.metrics.cost += cost
        if success:
            self.metrics.successes += 1
            self.metrics.gmv += reward
        else:
            self.metrics.failures += 1

        self._propagate_result(agent, success)

    def _propagate_result(self, agent: AgentNode, success: bool) -> None:
        current = agent
        first = True
        while current is not None:
            if first:
                current.stats.record(success)
                first = False
            current.stats.record_clade(success)
            current = self._agents.get(current.parent_id) if current.parent_id else None

    # ------------------------------------------------------------------
    def final_agent(self) -> Optional[AgentNode]:
        if not self._agents:
            return None

        percentile = self.epsilon
        best_agent = None
        best_value = -1.0
        for agent in self._agents.values():
            if agent.pruned:
                continue
            a = agent.stats.successes + 1
            b = agent.stats.failures + 1
            value = self._beta_percentile(a, b, percentile)
            if value > best_value:
                best_value = value
                best_agent = agent
        return best_agent

    def _beta_percentile(self, a: float, b: float, percentile: float) -> float:
        # Use inverse CDF approximation via bisection
        low, high = 0.0, 1.0
        for _ in range(30):
            mid = (low + high) / 2
            if self._beta_cdf(mid, a, b) < percentile:
                low = mid
            else:
                high = mid
        return (low + high) / 2

    def _beta_cdf(self, x: float, a: float, b: float) -> float:
        # Numerical integration using incomplete beta function approximation
        # For simplicity and determinism we use a series expansion.
        total = 0.0
        for k in range(50):
            coeff = math.comb(a + b - 1 + k, k)
            total += coeff * (x ** (a + k)) * ((1 - x) ** b) / (a + k)
        norm = math.gamma(a + b) / (math.gamma(a) * math.gamma(b))
        return norm * total

    # ------------------------------------------------------------------
    def update_tau(self, value: float) -> None:
        if value <= 0:
            raise ValueError("tau must be positive")
        self.tau = value

    def update_alpha(self, value: float) -> None:
        if value <= 0:
            raise ValueError("alpha must be positive")
        self.alpha = value

    def prune_agent(self, agent_id: str) -> None:
        agent = self._agents.get(agent_id)
        if agent:
            agent.pruned = True
            agent.mark_busy(False)

