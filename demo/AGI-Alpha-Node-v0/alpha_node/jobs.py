"""Job discovery and execution primitives."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

from .state import StateStore


@dataclass(slots=True)
class JobOpportunity:
    job_id: str
    domain: str
    reward: float
    stake_required: float
    duration_hours: float
    success_probability: float
    impact_score: float
    client: str


class JobRegistry:
    """Minimal job registry backed by a JSON file."""

    def __init__(self, source: Path) -> None:
        self.source = source

    def list_jobs(self) -> List[JobOpportunity]:
        if not self.source.exists():
            return []
        payload = json.loads(self.source.read_text())
        jobs = []
        for entry in payload:
            jobs.append(
                JobOpportunity(
                    job_id=entry["job_id"],
                    domain=entry["domain"],
                    reward=float(entry["reward"]),
                    stake_required=float(entry.get("stake_required", 0.0)),
                    duration_hours=float(entry.get("duration_hours", 1.0)),
                    success_probability=float(entry.get("success_probability", 0.5)),
                    impact_score=float(entry.get("impact_score", 1.0)),
                    client=entry.get("client", "unknown"),
                )
            )
        return jobs


class TaskHarvester:
    """Bridge between on-chain job discovery and the planner."""

    def __init__(self, registry: JobRegistry, store: StateStore) -> None:
        self.registry = registry
        self.store = store

    def harvest(self) -> Iterable[JobOpportunity]:
        jobs = self.registry.list_jobs()
        self.store.update(active_jobs=len(jobs))
        return jobs


__all__ = ["JobRegistry", "JobOpportunity", "TaskHarvester"]
