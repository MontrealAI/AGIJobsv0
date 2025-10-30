"""Economic ledger utilities for the OMNI demo."""

from __future__ import annotations

import dataclasses
from typing import Dict, List, Mapping, MutableMapping


@dataclasses.dataclass
class LedgerEntry:
    """Aggregated metrics for a single task."""

    attempts: int = 0
    successes: int = 0
    revenue: float = 0.0
    fm_cost: float = 0.0
    intervention_cost: float = 0.0

    def record(self, success: bool, revenue: float, fm_cost: float, intervention_cost: float) -> None:
        self.attempts += 1
        if success:
            self.successes += 1
        self.revenue += revenue
        self.fm_cost += fm_cost
        self.intervention_cost += intervention_cost

    @property
    def roi(self) -> float:
        total_cost = self.fm_cost + self.intervention_cost
        if total_cost <= 0:
            return float("inf") if self.revenue > 0 else 0.0
        return self.revenue / total_cost

    @property
    def success_rate(self) -> float:
        if self.attempts == 0:
            return 0.0
        return self.successes / self.attempts


class EconomicLedger:
    """Tracks per-task economic outcomes and derived KPIs."""

    def __init__(self) -> None:
        self._entries: MutableMapping[str, LedgerEntry] = {}
        self.events: List[Mapping[str, object]] = []

    def record(
        self,
        *,
        step: int,
        strategy: str,
        task_id: str,
        success: bool,
        revenue: float,
        fm_cost: float,
        intervention_cost: float,
    ) -> None:
        entry = self._entries.setdefault(task_id, LedgerEntry())
        entry.record(success=success, revenue=revenue, fm_cost=fm_cost, intervention_cost=intervention_cost)
        self.events.append(
            {
                "step": step,
                "strategy": strategy,
                "task_id": task_id,
                "success": success,
                "revenue": revenue,
                "fm_cost": fm_cost,
                "intervention_cost": intervention_cost,
                "roi": entry.roi,
            }
        )

    def task_summary(self) -> Dict[str, Mapping[str, float]]:
        summary: Dict[str, Mapping[str, float]] = {}
        for task_id, entry in self._entries.items():
            summary[task_id] = {
                "attempts": entry.attempts,
                "successes": entry.successes,
                "success_rate": entry.success_rate,
                "revenue": entry.revenue,
                "fm_cost": entry.fm_cost,
                "intervention_cost": entry.intervention_cost,
                "roi": entry.roi,
            }
        return summary

    def totals(self) -> Mapping[str, float]:
        total_attempts = sum(entry.attempts for entry in self._entries.values())
        total_revenue = sum(entry.revenue for entry in self._entries.values())
        total_fm_cost = sum(entry.fm_cost for entry in self._entries.values())
        total_intervention_cost = sum(entry.intervention_cost for entry in self._entries.values())
        total_cost = total_fm_cost + total_intervention_cost
        overall_roi = (total_revenue / total_cost) if total_cost > 0 else (float("inf") if total_revenue > 0 else 0.0)
        return {
            "attempts": total_attempts,
            "revenue": total_revenue,
            "fm_cost": total_fm_cost,
            "intervention_cost": total_intervention_cost,
            "roi_overall": overall_roi,
        }

    def top_losses(self, limit: int = 3) -> List[str]:
        """Return task IDs with worst ROI to support Sentinel interventions."""

        scored = sorted(self._entries.items(), key=lambda item: item[1].roi)
        return [task_id for task_id, _ in scored[:limit]]

