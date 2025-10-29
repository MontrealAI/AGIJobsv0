"""Core simulation engine for the Huxley–Gödel Machine demo.

The implementation follows Algorithm 1 from the HGM paper and provides a
simulation-friendly interface that cooperates with the orchestrator layer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Dict, Iterable, List, Optional, Tuple
import math
import random


class AgentStatus(Enum):
    ACTIVE = "active"
    PRUNED = "pruned"
    PAUSED = "paused"


class ActionType(Enum):
    EXPAND = auto()
    EVALUATE = auto()
    STOP = auto()
    WAIT = auto()


@dataclass
class AgentNode:
    agent_id: str
    parent_id: Optional[str]
    depth: int
    quality: float
    status: AgentStatus = AgentStatus.ACTIVE
    direct_success: int = 0
    direct_failure: int = 0
    clade_success: int = 0
    clade_failure: int = 0
    inflight_expansions: int = 0
    inflight_evaluations: int = 0

    @property
    def total_attempts(self) -> int:
        return self.direct_success + self.direct_failure

    @property
    def clade_attempts(self) -> int:
        return self.clade_success + self.clade_failure

    def mark_evaluation_start(self) -> None:
        self.inflight_evaluations += 1

    def mark_evaluation_end(self) -> None:
        self.inflight_evaluations = max(0, self.inflight_evaluations - 1)

    def mark_expansion_start(self) -> None:
        self.inflight_expansions += 1

    def mark_expansion_end(self) -> None:
        self.inflight_expansions = max(0, self.inflight_expansions - 1)


@dataclass
class Action:
    kind: ActionType
    agent_id: Optional[str] = None
    parent_id: Optional[str] = None


class HGMEngine:
    """Implements clade-metaproductivity guided scheduling and bookkeeping."""

    def __init__(
        self,
        tau: float,
        alpha: float,
        epsilon: float,
        max_agents: int,
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
        self.max_agents = max_agents
        self.max_expansions = max_expansions
        self.max_evaluations = max_evaluations
        self.rng = rng

        self._agents: Dict[str, AgentNode] = {}
        self._children: Dict[str, List[str]] = {}
        self._expansions = 0
        self._evaluations = 0
        self._next_id = 0
        self._stop_requested = False
        self.expansions_allowed = True
        self.evaluations_allowed = True
        self.max_evaluation_concurrency = 1
        self.max_expansion_concurrency = 1

    # ------------------------------------------------------------------
    # Agent management
    # ------------------------------------------------------------------
    def register_root(self, quality: float) -> AgentNode:
        root_id = self._generate_agent_id()
        node = AgentNode(agent_id=root_id, parent_id=None, depth=0, quality=quality)
        self._agents[root_id] = node
        self._children[root_id] = []
        return node

    def _generate_agent_id(self) -> str:
        agent_id = f"agent-{self._next_id:04d}"
        self._next_id += 1
        return agent_id

    def get_agent(self, agent_id: str) -> AgentNode:
        return self._agents[agent_id]

    def agents(self) -> Iterable[AgentNode]:
        return self._agents.values()

    # ------------------------------------------------------------------
    # Scheduling logic
    # ------------------------------------------------------------------
    def next_action(self) -> Action:
        if self._stop_requested:
            return Action(ActionType.STOP)

        if self._evaluations >= self.max_evaluations:
            return self.request_stop()
        if self._expansions >= self.max_expansions:
            self.expansions_allowed = False
        if len(self._agents) >= self.max_agents:
            self.expansions_allowed = False

        # Determine whether expansion or evaluation is prioritised.
        if self.expansions_allowed and self._can_expand():
            expansion_action = self._select_expansion_candidate()
            if expansion_action is not None:
                return expansion_action

        if self.evaluations_allowed and self._can_evaluate():
            evaluation_action = self._select_evaluation_candidate()
            if evaluation_action is not None:
                return evaluation_action

        # If neither action is possible, stop gracefully.
        inflight = self._total_inflight()
        if inflight == 0:
            return self.request_stop()
        return Action(ActionType.WAIT)

    def _total_inflight(self) -> int:
        return sum(
            node.inflight_evaluations + node.inflight_expansions for node in self._agents.values()
        )

    def _can_expand(self) -> bool:
        inflight = sum(node.inflight_expansions for node in self._agents.values())
        if inflight >= self.max_expansion_concurrency:
            return False
        if len(self._agents) == 0:
            return False
        # Alpha rule: expand if |T| <= N^alpha.
        current_agents = len(self._agents)
        evaluations = max(1, self._evaluations)
        threshold = evaluations ** self.alpha
        return current_agents <= threshold

    def _can_evaluate(self) -> bool:
        inflight = sum(node.inflight_evaluations for node in self._agents.values())
        if inflight >= self.max_evaluation_concurrency:
            return False
        if len(self._agents) == 0:
            return False
        return True

    def _select_expansion_candidate(self) -> Optional[Action]:
        candidates: List[Tuple[float, AgentNode]] = []
        for node in self._agents.values():
            if node.status is not AgentStatus.ACTIVE:
                continue
            if node.inflight_expansions > 0:
                continue
            score = self._sample_clade_thompson(node)
            candidates.append((score, node))
        if not candidates:
            return None
        candidates.sort(key=lambda item: item[0], reverse=True)
        chosen = candidates[0][1]
        chosen.mark_expansion_start()
        self._expansions += 1
        return Action(ActionType.EXPAND, parent_id=chosen.agent_id)

    def _select_evaluation_candidate(self) -> Optional[Action]:
        candidates: List[Tuple[float, AgentNode]] = []
        for node in self._agents.values():
            if node.status is not AgentStatus.ACTIVE:
                continue
            if node.inflight_evaluations >= 1:
                # avoid duplicate evaluation on same agent concurrently
                continue
            score = self._sample_direct_thompson(node)
            candidates.append((score, node))
        if not candidates:
            return None
        candidates.sort(key=lambda item: item[0], reverse=True)
        chosen = candidates[0][1]
        chosen.mark_evaluation_start()
        self._evaluations += 1
        return Action(ActionType.EVALUATE, agent_id=chosen.agent_id)

    def _sample_clade_thompson(self, node: AgentNode) -> float:
        alpha = self.tau * (1.0 + node.clade_success)
        beta = self.tau * (1.0 + node.clade_failure)
        return self.rng.betavariate(alpha, beta)

    def _sample_direct_thompson(self, node: AgentNode) -> float:
        alpha = self.tau * (1.0 + node.direct_success)
        beta = self.tau * (1.0 + node.direct_failure)
        return self.rng.betavariate(alpha, beta)

    # ------------------------------------------------------------------
    # Result handling
    # ------------------------------------------------------------------
    def complete_expansion(self, parent_id: str, quality: float) -> AgentNode:
        parent = self._agents[parent_id]
        parent.mark_expansion_end()
        child_id = self._generate_agent_id()
        child = AgentNode(
            agent_id=child_id,
            parent_id=parent_id,
            depth=parent.depth + 1,
            quality=quality,
        )
        self._agents[child_id] = child
        self._children.setdefault(parent_id, []).append(child_id)
        self._children[child_id] = []
        return child

    def record_evaluation(self, agent_id: str, success: bool) -> None:
        node = self._agents[agent_id]
        node.mark_evaluation_end()
        if success:
            node.direct_success += 1
        else:
            node.direct_failure += 1
        # Update clade counts up the lineage.
        current_id: Optional[str] = agent_id
        while current_id is not None:
            current_node = self._agents[current_id]
            if success:
                current_node.clade_success += 1
            else:
                current_node.clade_failure += 1
            current_id = current_node.parent_id

    def request_stop(self) -> Action:
        self._stop_requested = True
        return Action(ActionType.STOP)

    # ------------------------------------------------------------------
    # Adaptive parameters from Thermostat / Sentinel
    # ------------------------------------------------------------------
    def update_tau(self, tau: float) -> None:
        if tau <= 0:
            raise ValueError("tau must be positive")
        self.tau = tau

    def update_alpha(self, alpha: float) -> None:
        if alpha <= 0:
            raise ValueError("alpha must be positive")
        self.alpha = alpha

    def set_max_evaluation_concurrency(self, value: int) -> None:
        self.max_evaluation_concurrency = max(1, value)

    def set_max_expansion_concurrency(self, value: int) -> None:
        self.max_expansion_concurrency = max(1, value)

    def prune_agent(self, agent_id: str) -> None:
        node = self._agents[agent_id]
        node.status = AgentStatus.PRUNED

    # ------------------------------------------------------------------
    # Final selection
    # ------------------------------------------------------------------
    def best_agent(self) -> Optional[AgentNode]:
        if not self._agents:
            return None
        best_node: Optional[AgentNode] = None
        best_score = -math.inf
        for node in self._agents.values():
            if node.total_attempts == 0:
                continue
            alpha = 1 + node.direct_success
            beta = 1 + node.direct_failure
            score = self._beta_percentile(alpha, beta, self.epsilon)
            if score > best_score:
                best_score = score
                best_node = node
        return best_node

    @staticmethod
    def _beta_percentile(alpha: float, beta: float, epsilon: float) -> float:
        # Approximate inverse Beta using incomplete beta function approximation.
        # For the demo we employ a simple search which is sufficient for small
        # epsilon values and keeps dependencies minimal.
        lower, upper = 0.0, 1.0
        for _ in range(40):
            mid = (lower + upper) / 2
            cdf = _beta_cdf(mid, alpha, beta)
            if cdf < epsilon:
                lower = mid
            else:
                upper = mid
        return (lower + upper) / 2


def _beta_cdf(x: float, alpha: float, beta: float) -> float:
    # Incomplete beta via continued fraction expansion (Lentz's algorithm).
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0

    ln_beta = math.lgamma(alpha) + math.lgamma(beta) - math.lgamma(alpha + beta)
    front = math.exp(alpha * math.log(x) + beta * math.log(1 - x) - ln_beta) / alpha

    def cont_frac(a: float, b: float, x_value: float) -> float:
        max_iter = 200
        eps = 1e-12
        am, bm = 1.0, 1.0
        az = 1.0
        qab = alpha + beta
        qap = alpha + 1
        qam = alpha - 1
        bz = 1.0 - qab * x_value / qap
        if abs(bz) < eps:
            bz = eps
        c = 1.0
        d = 1.0 / bz
        h = d
        for m in range(1, max_iter + 1):
            m2 = 2 * m
            aa = m * (beta - m) * x_value / ((qam + m2) * (alpha + m2))
            d = 1.0 + aa * d
            if abs(d) < eps:
                d = eps
            c = 1.0 + aa / c
            if abs(c) < eps:
                c = eps
            d = 1.0 / d
            h *= d * c
            aa = -(alpha + m) * (qab + m) * x_value / ((alpha + m2) * (qap + m2))
            d = 1.0 + aa * d
            if abs(d) < eps:
                d = eps
            c = 1.0 + aa / c
            if abs(c) < eps:
                c = eps
            d = 1.0 / d
            delta = d * c
            h *= delta
            if abs(delta - 1.0) < eps:
                break
        return h

    return front * cont_frac(alpha, beta, x)


__all__ = [
    "Action",
    "ActionType",
    "AgentNode",
    "AgentStatus",
    "HGMEngine",
]
