"""Economic safety guard-rails for the Huxley–Gödel Machine demo."""
from __future__ import annotations

from dataclasses import dataclass

from .configuration import SentinelConfig
from .engine import HGMEngine


@dataclass(slots=True)
class SentinelState:
    expansions_allowed: bool = True
    halted: bool = False
    reason: str = ""


class Sentinel:
    """Hard constraint enforcement for economic safety."""

    def __init__(self, config: SentinelConfig, engine: HGMEngine) -> None:
        self.config = config
        self.engine = engine
        self.state = SentinelState()
        self._cooldown = 0

    def inspect(self) -> SentinelState:
        ledger = self.engine.ledger
        if ledger.cost >= self.config.cost_ceiling:
            self.state.halted = True
            self.state.reason = "Cost ceiling reached"
            return self.state

        if ledger.roi < self.config.roi_hard_floor and ledger.cost > 0:
            self.state.expansions_allowed = False
            self.state.reason = "ROI floor breached"
            self._cooldown = self.config.cooldown_iterations
        elif self._cooldown > 0:
            self._cooldown -= 1
            if self._cooldown == 0:
                self.state.expansions_allowed = True
                self.state.reason = "ROI recovered"

        for agent in self.engine.nodes.values():
            if agent.failures >= self.config.max_failures_per_agent:
                agent.is_pruned = True

        self.engine.hgm_config.allow_expansions = self.state.expansions_allowed and not self.state.halted
        return self.state


__all__ = ["Sentinel", "SentinelState"]
