"""Telemetry primitives for the AlphaEvolve demo."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import List

from .evaluation import EvaluationResult


@dataclass
class MetricSnapshot:
    generation: int
    utility: float
    gmv: float
    cost: float
    latency: float
    fairness: float

    @classmethod
    def from_result(cls, result: EvaluationResult, generation: int | None = None) -> "MetricSnapshot":
        return cls(
            generation=generation or -1,
            utility=result.utility,
            gmv=result.gmv,
            cost=result.cost,
            latency=result.latency,
            fairness=result.fairness,
        )


class Telemetry:
    def __init__(self) -> None:
        self.snapshots: List[MetricSnapshot] = []
        self.events: List[str] = []

    def record_generation(self, generation: int, snapshot: MetricSnapshot) -> None:
        snapshot.generation = generation
        self.snapshots.append(snapshot)

    def log_event(self, message: str) -> None:
        timestamp = dt.datetime.utcnow().isoformat() + "Z"
        self.events.append(f"[{timestamp}] {message}")

    def render_report(self) -> str:
        lines = ["AlphaEvolve Demo Telemetry", "===========================", "Generations:"]
        for snapshot in self.snapshots:
            lines.append(
                f"Gen {snapshot.generation}: Utility={snapshot.utility:.2f}, GMV={snapshot.gmv:.2f}, Cost={snapshot.cost:.2f}, "
                f"Latency={snapshot.latency:.2f}, Fairness={snapshot.fairness:.2f}"
            )
        if not self.snapshots:
            lines.append("No generations recorded yet.")
        lines.append("\nEvents:")
        lines.extend(self.events or ["No events recorded."])
        return "\n".join(lines)

