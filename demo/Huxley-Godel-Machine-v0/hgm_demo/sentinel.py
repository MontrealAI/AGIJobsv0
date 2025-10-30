"""Economic safety rules for the HGM demo."""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import DemoConfig
from .engine import HGMEngine
from .simulation import EvaluationOutcome


@dataclass(slots=True)
class Sentinel:
    """Monitors ROI and failure streaks to prevent unsound behaviour."""

    config: DemoConfig
    engine: HGMEngine
    expansions_allowed: bool = True
    _failure_counts: dict[str, int] = field(default_factory=dict, init=False)

    def observe(self, outcome: EvaluationOutcome) -> None:
        agent_id = outcome.agent_id
        if outcome.success:
            self._failure_counts[agent_id] = 0
        else:
            self._failure_counts[agent_id] = self._failure_counts.get(agent_id, 0) + 1
            if self._failure_counts[agent_id] >= self.config.max_failures_per_agent:
                self.engine.prune_agent(agent_id)

    def enforce(self, iteration: int, persistence) -> None:  # noqa: D401 - simple enforcement
        """Check ROI and budget rules each iteration."""

        roi = self.engine.metrics.roi
        if roi < self.config.roi_floor or self.engine.metrics.cost >= self.config.max_cost:
            self.expansions_allowed = False
        elif roi >= self.config.roi_floor * 1.1:
            self.expansions_allowed = True

