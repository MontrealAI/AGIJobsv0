"""Implementation of the Huxley–Gödel Machine engine for the demo."""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Set, Tuple

from .structures import AgentNode


@dataclass
class EngineStats:
    total_evaluations: int = 0
    total_expansions: int = 0
    actions_taken: int = 0


@dataclass
class EngineParameters:
    tau: float
    alpha: float
    epsilon: float
    max_agents: int
    max_actions: int


@dataclass
class EngineState:
    agents: Dict[str, AgentNode] = field(default_factory=dict)
    children: Dict[str, List[str]] = field(default_factory=dict)
    busy_agents: Set[str] = field(default_factory=set)
    pruned_agents: Set[str] = field(default_factory=set)


class HGMEngine:
    """Core decision engine mirroring Algorithm 1 from the HGM paper."""

    def __init__(
        self,
        params: EngineParameters,
        rng: random.Random,
        *,
        allow_expansions: bool = True,
    ) -> None:
        self.params = params
        self.rng = rng
        self.state = EngineState()
        self.stats = EngineStats()
        self.allow_expansions = allow_expansions

    # ------------------------------------------------------------------
    # Registration & queries
    # ------------------------------------------------------------------
    def register_root(self, agent: AgentNode) -> None:
        if self.state.agents:
            raise ValueError("Root already registered")
        self.state.agents[agent.agent_id] = agent
        self.state.children[agent.agent_id] = []

    def register_child(self, parent_id: str, agent: AgentNode) -> None:
        if agent.agent_id in self.state.agents:
            raise ValueError(f"Agent {agent.agent_id} already exists")
        self.state.agents[agent.agent_id] = agent
        self.state.children.setdefault(parent_id, []).append(agent.agent_id)
        self.state.children.setdefault(agent.agent_id, [])
        self.state.busy_agents.discard(parent_id)
        self.stats.total_expansions += 1
        self.stats.actions_taken += 1

    def mark_pruned(self, agent_id: str) -> None:
        self.state.pruned_agents.add(agent_id)

    def agents_iter(self) -> Iterable[AgentNode]:
        return self.state.agents.values()

    def get_agent(self, agent_id: str) -> AgentNode:
        return self.state.agents[agent_id]

    # ------------------------------------------------------------------
    # Thompson sampling helpers
    # ------------------------------------------------------------------
    def _beta_sample(self, success: int, failure: int, tau: float) -> float:
        alpha = tau * (1 + success)
        beta = tau * (1 + failure)
        return self.rng.betavariate(alpha, beta)

    def _expansion_candidates(self) -> List[str]:
        if not self.allow_expansions:
            return []
        ids: List[str] = []
        for agent_id, node in self.state.agents.items():
            if agent_id in self.state.busy_agents:
                continue
            if agent_id in self.state.pruned_agents:
                continue
            if len(self.state.children.get(agent_id, [])) == 0 or any(
                child_id in self.state.pruned_agents for child_id in self.state.children.get(agent_id, [])
            ):
                ids.append(agent_id)
            else:
                ids.append(agent_id)
        return ids

    def _evaluation_candidates(self) -> List[str]:
        return [
            agent_id
            for agent_id in self.state.agents
            if agent_id not in self.state.busy_agents and agent_id not in self.state.pruned_agents
        ]

    def _pick_expansion_target(self) -> Optional[str]:
        candidates = self._expansion_candidates()
        if not candidates:
            return None
        scored = [
            (self._beta_sample(self.state.agents[c].clade_success, self.state.agents[c].clade_failure, self.params.tau), c)
            for c in candidates
        ]
        scored.sort(reverse=True)
        return scored[0][1]

    def _pick_evaluation_target(self) -> Optional[str]:
        candidates = self._evaluation_candidates()
        if not candidates:
            return None
        scored = [
            (self._beta_sample(self.state.agents[c].self_success, self.state.agents[c].self_failure, self.params.tau), c)
            for c in candidates
        ]
        scored.sort(reverse=True)
        return scored[0][1]

    # ------------------------------------------------------------------
    # Decision logic
    # ------------------------------------------------------------------
    def _should_expand(self) -> bool:
        if not self.allow_expansions:
            return False
        if len(self.state.agents) >= self.params.max_agents:
            return False
        evaluations = max(1, self.stats.total_evaluations)
        bound = evaluations ** self.params.alpha
        return len(self.state.agents) <= bound

    def next_action(self) -> Optional[Tuple[str, str]]:
        if self.stats.actions_taken >= self.params.max_actions:
            return None
        if self._should_expand():
            target = self._pick_expansion_target()
            if target is not None:
                self.state.busy_agents.add(target)
                return ("expand", target)
        target = self._pick_evaluation_target()
        if target is not None:
            self.state.busy_agents.add(target)
            return ("evaluate", target)
        return None

    # ------------------------------------------------------------------
    # Results integration
    # ------------------------------------------------------------------
    def record_evaluation(self, agent_id: str, success: bool) -> None:
        self.stats.total_evaluations += 1
        self.stats.actions_taken += 1
        self.state.busy_agents.discard(agent_id)
        node = self.state.agents[agent_id]
        self._propagate_result(node, success)

    def _propagate_result(self, node: AgentNode, success: bool) -> None:
        cursor: Optional[AgentNode] = node
        while cursor is not None:
            if success:
                cursor.clade_success += 1
            else:
                cursor.clade_failure += 1
            if cursor.agent_id == node.agent_id:
                cursor.register_result(success)
            parent_id = cursor.parent_id
            cursor = self.state.agents[parent_id] if parent_id else None

    def pending_agents(self) -> Set[str]:
        return set(self.state.busy_agents)

    def update_parameters(self, *, tau: Optional[float] = None, alpha: Optional[float] = None) -> None:
        if tau is not None:
            self.params.tau = max(1e-6, tau)
        if alpha is not None:
            self.params.alpha = max(1.0, alpha)

    def set_expansion_allowed(self, allowed: bool) -> None:
        self.allow_expansions = allowed

    def select_final_agent(self) -> Optional[AgentNode]:
        if not self.state.agents:
            return None
        epsilon = self.params.epsilon
        best_score = -math.inf
        best_node: Optional[AgentNode] = None
        for node in self.state.agents.values():
            alpha = 1 + node.self_success
            beta_param = 1 + node.self_failure
            lower_bound = self._beta_percentile(alpha, beta_param, epsilon)
            if lower_bound > best_score:
                best_score = lower_bound
                best_node = node
        return best_node

    def _beta_percentile(self, alpha: float, beta_param: float, epsilon: float) -> float:
        # Use inverse incomplete beta via binary search for percentile
        low, high = 0.0, 1.0
        for _ in range(40):
            mid = 0.5 * (low + high)
            if self._beta_cdf(mid, alpha, beta_param) < epsilon:
                low = mid
            else:
                high = mid
        return 0.5 * (low + high)

    def _beta_cdf(self, x: float, alpha: float, beta_param: float) -> float:
        # Regularized incomplete beta via continued fraction (modified Lentz algorithm)
        if x <= 0:
            return 0.0
        if x >= 1:
            return 1.0
        ln_beta = math.lgamma(alpha) + math.lgamma(beta_param) - math.lgamma(alpha + beta_param)
        front = math.exp(alpha * math.log(x) + beta_param * math.log(1 - x) - ln_beta) / alpha
        return front * self._betacf(alpha, beta_param, x)

    def _betacf(self, a: float, b: float, x: float) -> float:
        # Adapted from Numerical Recipes implementation
        MAX_ITER = 200
        EPS = 3e-7
        FPMIN = 1e-30
        m2 = 0
        aa = 0.0
        c = 1.0
        d = 1.0 - (a + b) * x / (a + 1.0)
        if abs(d) < FPMIN:
            d = FPMIN
        d = 1.0 / d
        h = d
        for m in range(1, MAX_ITER + 1):
            m2 = 2 * m
            aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2))
            d = 1.0 + aa * d
            if abs(d) < FPMIN:
                d = FPMIN
            c = 1.0 + aa / c
            if abs(c) < FPMIN:
                c = FPMIN
            d = 1.0 / d
            h *= d * c
            aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1))
            d = 1.0 + aa * d
            if abs(d) < FPMIN:
                d = FPMIN
            c = 1.0 + aa / c
            if abs(c) < FPMIN:
                c = FPMIN
            d = 1.0 / d
            del_h = d * c
            h *= del_h
            if abs(del_h - 1.0) < EPS:
                break
        return h
