"""Economic and safety guard-rails for the HGM demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .engine import HGMEngine
from .metrics import EconomicSnapshot


@dataclass
class SentinelDecision:
    halt_all: bool = False
    pause_expansions: bool = False
    pause_evaluations: bool = False


@dataclass
class SentinelState:
    consecutive_roi_breaches: int = 0


class Sentinel:
    def __init__(
        self,
        engine: HGMEngine,
        max_budget: float,
        min_roi: float,
        hard_budget_ratio: float,
        max_failures_per_agent: int,
        roi_recovery_steps: int,
    ) -> None:
        self.engine = engine
        self.max_budget = max_budget
        self.min_roi = min_roi
        self.hard_budget_ratio = hard_budget_ratio
        self.max_failures_per_agent = max_failures_per_agent
        self.roi_recovery_steps = roi_recovery_steps
        self.state = SentinelState()

    def evaluate(self, snapshot: EconomicSnapshot) -> SentinelDecision:
        decision = SentinelDecision()
        pause_expansions = False
        pause_evaluations = False

        if snapshot.cost >= self.max_budget:
            decision.halt_all = True
            pause_expansions = True
            pause_evaluations = True
        elif snapshot.cost >= self.max_budget * self.hard_budget_ratio:
            pause_expansions = True

        # ROI monitoring
        if snapshot.cost > 0 and snapshot.roi < self.min_roi:
            self.state.consecutive_roi_breaches += 1
        else:
            self.state.consecutive_roi_breaches = max(0, self.state.consecutive_roi_breaches - 1)

        if self.state.consecutive_roi_breaches >= self.roi_recovery_steps:
            pause_expansions = True

        # Agent level pruning
        for agent in self.engine.agents():
            if agent.direct_failure >= self.max_failures_per_agent:
                self.engine.prune_agent(agent.agent_id)

        decision.pause_expansions = pause_expansions
        decision.pause_evaluations = pause_evaluations
        return decision


__all__ = ["Sentinel", "SentinelDecision"]
