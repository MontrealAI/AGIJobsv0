"""Economic safety guardrails for the HGM demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

from .engine import HGMEngine
from .metrics import RunMetrics


@dataclass
class SentinelConfig:
    min_roi: float = 1.0
    recovery_roi: float = 1.05
    max_cost: float = 10_000.0
    max_failures_per_agent: int = 6


@dataclass
class SentinelOutcome:
    allow_expansions: bool
    allow_evaluations: bool
    triggered_rules: List[str]


class Sentinel:
    """Evaluates hard economic and safety constraints for every scheduling step."""

    def __init__(self, config: SentinelConfig | None = None) -> None:
        self.config = config or SentinelConfig()
        self._expansions_paused = False

    def inspect(self, engine: HGMEngine, metrics: RunMetrics) -> SentinelOutcome:
        triggered: List[str] = []
        allow_expansions = True
        allow_evaluations = True

        if metrics.total_cost >= self.config.max_cost:
            triggered.append("budget_cap")
            allow_expansions = False
            allow_evaluations = False

        roi = metrics.roi
        if metrics.total_cost > 0 and roi < self.config.min_roi:
            if not self._expansions_paused:
                triggered.append("roi_floor")
            self._expansions_paused = True
        elif self._expansions_paused and roi >= self.config.recovery_roi:
            triggered.append("roi_recovered")
            self._expansions_paused = False

        if self._expansions_paused:
            allow_expansions = False

        self._prune_unproductive_agents(engine, metrics, triggered)

        return SentinelOutcome(
            allow_expansions=allow_expansions,
            allow_evaluations=allow_evaluations,
            triggered_rules=triggered,
        )

    def _prune_unproductive_agents(self, engine: HGMEngine, metrics: RunMetrics, triggered: List[str]) -> None:
        max_failures = self.config.max_failures_per_agent
        if max_failures <= 0:
            return
        for agent_id, failure_count in list(metrics.agent_failures.items()):
            if failure_count >= max_failures:
                engine.prune_agent(agent_id, f"Sentinel capped after {failure_count} failures")
                triggered.append(f"pruned:{agent_id}")
                metrics.reset_agent_failure(agent_id)


__all__ = ["Sentinel", "SentinelConfig", "SentinelOutcome"]
