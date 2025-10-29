"""Core Huxley–Gödel Machine simulation engine used by the demo.

The goal of this module is to provide a faithful-yet-accessible
implementation of the high-level behaviours described in Algorithm 1 of the
Huxley–Gödel Machine (HGM).  The real production implementation would wire the
engine into asynchronous workers, blockchains, and safety layers.  For the
purpose of the demo we expose a pure-Python, deterministic-friendly
implementation that can be exercised via CLI or notebook environments.

The module purposely contains extensive inline documentation to keep the code
friendly for non-technical operators exploring the AGI Jobs v0 (v2) platform.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Iterable, List, Optional, Set
import math
import random


class ActionType(str, Enum):
    """Enumerates the two high-level scheduling actions supported by HGM."""

    EXPAND = "expand"
    EVALUATE = "evaluate"


@dataclass
class DecisionContext:
    """Additional scheduling context supplied by the orchestrator layer."""

    allow_expansions: bool = True
    allow_evaluations: bool = True
    pending_expansions: int = 0
    pending_evaluations: int = 0
    max_concurrent_evaluations: int = 1


@dataclass
class EngineAction:
    """Represents a scheduling decision returned by :class:`HGMEngine`."""

    action: ActionType
    target_agent_id: str


@dataclass
class AgentNode:
    """Captures the statistics tracked for each agent in the lineage tree."""

    agent_id: str
    parent_id: Optional[str]
    quality: float
    generation: int = 0
    status: str = "active"
    description: str = ""
    successes: int = 0
    failures: int = 0
    clade_successes: int = 0
    clade_failures: int = 0
    children: List[str] = field(default_factory=list)

    def record_task_outcome(self, success: bool) -> None:
        if success:
            self.successes += 1
            self.clade_successes += 1
        else:
            self.failures += 1
            self.clade_failures += 1

    def record_clade_outcome(self, success: bool) -> None:
        if success:
            self.clade_successes += 1
        else:
            self.clade_failures += 1

    @property
    def total_trials(self) -> int:
        return self.successes + self.failures

    @property
    def success_rate(self) -> float:
        if self.total_trials == 0:
            return 0.0
        return self.successes / self.total_trials

    @property
    def clade_trials(self) -> int:
        return self.clade_successes + self.clade_failures

    @property
    def cmp_score(self) -> float:
        """Returns the clade-metaproductivity score used for expansion."""

        trials = self.clade_trials
        if trials == 0:
            return 0.0
        return self.clade_successes / trials


class HGMEngine:
    """Implements the scheduling and lineage tracking logic for the demo."""

    def __init__(
        self,
        *,
        tau: float = 1.0,
        alpha: float = 1.3,
        epsilon: float = 0.05,
        rng: Optional[random.Random] = None,
    ) -> None:
        if tau <= 0:
            raise ValueError("tau must be positive")
        if alpha <= 0:
            raise ValueError("alpha must be positive")
        if not 0.0 < epsilon < 1.0:
            raise ValueError("epsilon must be in (0, 1)")

        self.tau = tau
        self.alpha = alpha
        self.epsilon = epsilon
        self.rng = rng or random.Random()

        self.agents: Dict[str, AgentNode] = {}
        self.root_id: Optional[str] = None
        self._id_counter = 0

        self.total_evaluations = 0
        self.total_expansions = 0

        self._busy_agents: Set[str] = set()

    # ------------------------------------------------------------------
    # Agent management helpers
    # ------------------------------------------------------------------
    def _next_agent_id(self) -> str:
        self._id_counter += 1
        return f"agent-{self._id_counter}"

    def register_root(self, quality: float, *, description: str = "Root agent") -> AgentNode:
        if self.root_id is not None:
            raise RuntimeError("Root agent already registered")
        root = AgentNode(
            agent_id=self._next_agent_id(),
            parent_id=None,
            quality=max(0.0, min(1.0, quality)),
            generation=0,
            description=description,
        )
        self.agents[root.agent_id] = root
        self.root_id = root.agent_id
        return root

    def get_agent(self, agent_id: str) -> AgentNode:
        try:
            return self.agents[agent_id]
        except KeyError as exc:
            raise KeyError(f"Unknown agent id {agent_id}") from exc

    def list_agents(self) -> Iterable[AgentNode]:
        return self.agents.values()

    # ------------------------------------------------------------------
    # Scheduling decisions
    # ------------------------------------------------------------------
    def next_action(self, context: DecisionContext) -> Optional[EngineAction]:
        if self.root_id is None:
            raise RuntimeError("Engine must be initialised with register_root() first")

        expand_allowed = (
            context.allow_expansions
            and context.pending_expansions == 0
            and self._expansion_condition()
        )
        if expand_allowed:
            expansion_candidate = self._sample_agent_for_expansion()
            if expansion_candidate is not None:
                self._busy_agents.add(expansion_candidate.agent_id)
                return EngineAction(ActionType.EXPAND, expansion_candidate.agent_id)

        evaluation_capacity_available = (
            context.allow_evaluations
            and context.pending_evaluations < context.max_concurrent_evaluations
        )
        if evaluation_capacity_available:
            evaluation_candidate = self._sample_agent_for_evaluation()
            if evaluation_candidate is not None:
                self._busy_agents.add(evaluation_candidate.agent_id)
                return EngineAction(ActionType.EVALUATE, evaluation_candidate.agent_id)

        return None

    def mark_idle(self, agent_id: str) -> None:
        self._busy_agents.discard(agent_id)

    # ------------------------------------------------------------------
    # Action execution primitives
    # ------------------------------------------------------------------
    def create_child(self, parent_id: str, *, quality: float, description: str = "") -> AgentNode:
        parent = self.get_agent(parent_id)
        child = AgentNode(
            agent_id=self._next_agent_id(),
            parent_id=parent.agent_id,
            quality=max(0.0, min(1.0, quality)),
            generation=parent.generation + 1,
            description=description or f"Descendant of {parent.agent_id}",
        )
        self.agents[child.agent_id] = child
        parent.children.append(child.agent_id)
        self.total_expansions += 1
        return child

    def record_evaluation(self, agent_id: str, success: bool) -> None:
        agent = self.get_agent(agent_id)
        agent.record_task_outcome(success)
        self.total_evaluations += 1

        # propagate clade results up the lineage
        parent_id = agent.parent_id
        while parent_id is not None:
            parent = self.get_agent(parent_id)
            parent.record_clade_outcome(success)
            parent_id = parent.parent_id

    # ------------------------------------------------------------------
    # Introspection helpers
    # ------------------------------------------------------------------
    def _expansion_condition(self) -> bool:
        agent_count = len(self.agents)
        evaluation_term = max(1, self.total_evaluations)
        limit = math.pow(evaluation_term, self.alpha)
        return agent_count <= limit

    def _candidate_agents(self) -> List[AgentNode]:
        return [agent for agent in self.agents.values() if agent.status == "active" and agent.agent_id not in self._busy_agents]

    def _sample_agent_for_expansion(self) -> Optional[AgentNode]:
        candidates = self._candidate_agents()
        if not candidates:
            return None

        scored: List[tuple[float, AgentNode]] = []
        for agent in candidates:
            successes = agent.clade_successes + 1
            failures = agent.clade_failures + 1
            sample = self._beta_sample(successes, failures)
            scored.append((sample, agent))
        scored.sort(key=lambda item: item[0], reverse=True)
        return scored[0][1] if scored else None

    def _sample_agent_for_evaluation(self) -> Optional[AgentNode]:
        candidates = self._candidate_agents()
        if not candidates:
            return None

        scored: List[tuple[float, AgentNode]] = []
        for agent in candidates:
            successes = agent.successes + 1
            failures = agent.failures + 1
            sample = self._beta_sample(successes, failures)
            scored.append((sample, agent))
        scored.sort(key=lambda item: item[0], reverse=True)
        return scored[0][1] if scored else None

    def _beta_sample(self, successes: int, failures: int) -> float:
        alpha_param = self.tau * successes
        beta_param = self.tau * failures
        return self.rng.betavariate(alpha_param, beta_param)

    # ------------------------------------------------------------------
    # Final selection
    # ------------------------------------------------------------------
    def best_agent(self) -> AgentNode:
        if not self.agents:
            raise RuntimeError("No agents registered")
        percentile = self.epsilon
        best = None
        best_score = -1.0
        for agent in self.agents.values():
            a = agent.successes + 1
            b = agent.failures + 1
            score = self._beta_percentile(a, b, percentile)
            if score > best_score:
                best_score = score
                best = agent
        assert best is not None
        return best

    def _beta_percentile(self, alpha_param: float, beta_param: float, percentile: float) -> float:
        """Compute a percentile of a Beta distribution via inverse CDF approximation."""

        # Use binary search on the cumulative distribution function computed
        # through the regularised incomplete beta function.  To keep the module
        # dependency-free we approximate using a simple search with moderate
        # precision which is adequate for the demo scale.
        from math import isclose

        target = percentile
        low, high = 0.0, 1.0
        while high - low > 1e-4:
            mid = (low + high) / 2
            cdf = self._beta_cdf(mid, alpha_param, beta_param)
            if cdf < target:
                low = mid
            else:
                high = mid
        result = (low + high) / 2
        # Guard numerical artefacts
        if isclose(result, 0.0, abs_tol=1e-6):
            return 0.0
        if isclose(result, 1.0, abs_tol=1e-6):
            return 1.0
        return result

    def _beta_cdf(self, x: float, alpha_param: float, beta_param: float) -> float:
        if x <= 0:
            return 0.0
        if x >= 1:
            return 1.0

        MAX_ITER = 200
        EPS = 3e-7

        def cont_frac(a: float, b: float, x_val: float) -> float:
            am, bm = 1.0, 1.0
            az = 1.0
            qab = a + b
            qap = a + 1.0
            qam = a - 1.0
            bz = 1.0 - qab * x_val / qap
            if abs(bz) < 1e-30:
                bz = 1e-30
            em = 0.0
            tem = 0.0
            d = 0.0
            ap = 0.0
            bp = 0.0
            app = 0.0
            bpp = 0.0
            aold = 0.0
            for m in range(1, MAX_ITER + 1):
                em = float(m)
                tem = em + em
                d = em * (b - em) * x_val / ((qam + tem) * (a + tem))
                ap = az + d * am
                bp = bz + d * bm
                if abs(bp) < 1e-30:
                    bp = 1e-30
                d = -(a + em) * (qab + em) * x_val / ((a + tem) * (qap + tem))
                app = ap + d * az
                bpp = bp + d * bz
                if abs(bpp) < 1e-30:
                    bpp = 1e-30
                am, bm = ap / bp, az / bz
                az, bz = app / bpp, 1.0
                if abs(az - aold) < (EPS * abs(az)):
                    return az
                aold = az
            return az

        ln_beta = math.lgamma(alpha_param) + math.lgamma(beta_param) - math.lgamma(alpha_param + beta_param)
        front = math.exp(alpha_param * math.log(x) + beta_param * math.log(1 - x) - ln_beta) / alpha_param
        frac = cont_frac(alpha_param, beta_param, x)
        return front * frac

    # ------------------------------------------------------------------
    # Configuration adjustment hooks (used by the thermostat)
    # ------------------------------------------------------------------
    def update_tau(self, value: float) -> None:
        if value <= 0:
            raise ValueError("tau must stay positive")
        self.tau = value

    def update_alpha(self, value: float) -> None:
        if value <= 0:
            raise ValueError("alpha must stay positive")
        self.alpha = value

    # ------------------------------------------------------------------
    # Convenience for pruning agents via the sentinel
    # ------------------------------------------------------------------
    def prune_agent(self, agent_id: str, reason: str) -> None:
        agent = self.get_agent(agent_id)
        agent.status = "pruned"
        agent.description = (agent.description + f"\n[Pruned] {reason}").strip()


__all__ = [
    "ActionType",
    "AgentNode",
    "DecisionContext",
    "EngineAction",
    "HGMEngine",
]
