"""Safety guardrails for the HGM demo."""
from __future__ import annotations

from dataclasses import dataclass

from .structures import EconomicLedger


@dataclass
class SentinelSettings:
    min_roi: float
    max_cost: float
    max_failures_per_agent: int


class Sentinel:
    def __init__(self, settings: SentinelSettings) -> None:
        self.settings = settings
        self._halt = False

    @property
    def halt_requested(self) -> bool:
        return self._halt

    def evaluate(self, *, engine, ledger: EconomicLedger) -> None:
        if ledger.cost >= self.settings.max_cost:
            self._halt = True
        if ledger.roi < self.settings.min_roi:
            engine.set_expansion_allowed(False)
        else:
            engine.set_expansion_allowed(True)
        for node in engine.agents_iter():
            if node.self_failure >= self.settings.max_failures_per_agent:
                engine.mark_pruned(node.agent_id)
