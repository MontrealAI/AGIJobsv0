"""Core data structures for the HGM demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class EconomicLedger:
    gmv: float = 0.0
    cost: float = 0.0

    def record_success(self, value: float, cost: float) -> None:
        self.gmv += value
        self.cost += cost

    def record_failure(self, cost: float) -> None:
        self.cost += cost

    @property
    def profit(self) -> float:
        return self.gmv - self.cost

    @property
    def roi(self) -> float:
        if self.cost <= 0:
            return float("inf") if self.gmv > 0 else 0.0
        return self.gmv / self.cost


@dataclass
class AgentNode:
    """Represents a single agent in the lineage tree."""

    agent_id: str
    parent_id: Optional[str]
    depth: int
    quality: float
    clade_success: int = 0
    clade_failure: int = 0
    self_success: int = 0
    self_failure: int = 0
    generation: int = 0
    metadata: Dict[str, float] = field(default_factory=dict)

    def register_result(self, success: bool) -> None:
        if success:
            self.self_success += 1
            self.clade_success += 1
        else:
            self.self_failure += 1
            self.clade_failure += 1

    @property
    def total_trials(self) -> int:
        return self.self_success + self.self_failure

    @property
    def success_rate(self) -> float:
        if self.total_trials == 0:
            return 0.0
        return self.self_success / self.total_trials


@dataclass
class ActionLogEntry:
    step: int
    action_type: str
    agent_id: str
    payload: Dict[str, float]
    ledger_snapshot: EconomicLedger


@dataclass
class DemoTelemetry:
    """Captures all information required for the UI layer."""

    ledger: EconomicLedger = field(default_factory=EconomicLedger)
    agent_events: List[ActionLogEntry] = field(default_factory=list)
    final_agent_id: Optional[str] = None
    baseline_profit: Optional[float] = None
    hgm_profit: Optional[float] = None

    def to_dict(self) -> Dict[str, object]:
        return {
            "ledger": {"gmv": self.ledger.gmv, "cost": self.ledger.cost, "profit": self.ledger.profit, "roi": self.ledger.roi},
            "agent_events": [
                {
                    "step": e.step,
                    "action": e.action_type,
                    "agent_id": e.agent_id,
                    "payload": e.payload,
                    "ledger": {
                        "gmv": e.ledger_snapshot.gmv,
                        "cost": e.ledger_snapshot.cost,
                        "profit": e.ledger_snapshot.profit,
                        "roi": e.ledger_snapshot.roi,
                    },
                }
                for e in self.agent_events
            ],
            "final_agent_id": self.final_agent_id,
            "baseline_profit": self.baseline_profit,
            "hgm_profit": self.hgm_profit,
        }
