"""Telemetry helpers that emulate CMP dashboards."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from .tasks import TaskType


@dataclass
class IterationRecord:
    iteration: int
    task_identifier: str
    task_type: TaskType
    proposer_reward: float
    solver_reward: float
    economic_value: float
    success: bool


class TelemetryTracker:
    """Collects per-iteration metrics and exposes aggregated KPIs."""

    def __init__(self, *, solver_cost: float = 0.02) -> None:
        self._records: List[IterationRecord] = []
        self._gmv_total = 0.0
        self._cost_total = 0.0
        self._solver_cost = solver_cost

    def record(
        self,
        *,
        iteration: int,
        task_identifier: str,
        task_type: TaskType,
        proposer_reward: float,
        solver_reward: float,
        economic_value: float,
        success: bool,
    ) -> None:
        self._records.append(
            IterationRecord(
                iteration=iteration,
                task_identifier=task_identifier,
                task_type=task_type,
                proposer_reward=proposer_reward,
                solver_reward=solver_reward,
                economic_value=economic_value,
                success=success,
            )
        )
        if success:
            self._gmv_total += economic_value
        self._cost_total += self._solver_cost

    def aggregates(self) -> Dict[str, float]:
        total = len(self._records)
        success_count = sum(1 for r in self._records if r.success)
        return {
            "iterations": float(total),
            "success_rate": (success_count / total) if total else 0.0,
            "gmv_total": self._gmv_total,
            "cost_total": self._cost_total,
            "roi": self._gmv_total - self._cost_total,
        }

    def timeline(self) -> List[Dict[str, float]]:
        return [
            {
                "iteration": record.iteration,
                "success": 1.0 if record.success else 0.0,
                "economic_value": record.economic_value,
                "task_type": record.task_type.value,
            }
            for record in self._records
        ]


__all__ = ["TelemetryTracker", "IterationRecord"]
