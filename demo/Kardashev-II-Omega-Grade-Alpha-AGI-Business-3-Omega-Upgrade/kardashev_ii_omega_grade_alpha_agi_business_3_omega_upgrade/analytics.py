"""Analytics sinks for mission telemetry."""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Dict, Iterable

from .jobs import JobRecord, JobStatus
from .resources import ResourceManager


@dataclass(slots=True)
class AnalyticsFrame:
    timestamp: str
    cycle: int
    energy_available: float
    compute_available: float
    treasury: float
    active_jobs: int
    completed_jobs: int
    failed_jobs: int
    validator_votes: Dict[str, int]


class AnalyticsWriter:
    """Writes mission analytics to a JSON lines file."""

    def __init__(self, path: str) -> None:
        self._path = path
        self._lock = asyncio.Lock()

    async def write_frame(self, frame: AnalyticsFrame) -> None:
        payload = json.dumps(asdict(frame))
        async with self._lock:
            with open(self._path, "a", encoding="utf-8") as handle:
                handle.write(payload)
                handle.write("\n")

    async def record_snapshot(
        self,
        cycle: int,
        resources: ResourceManager,
        jobs: Iterable[JobRecord],
    ) -> None:
        snapshot = resources.snapshot()
        job_list = list(jobs)
        approvals: Dict[str, int] = {}
        for job in job_list:
            for validator, vote in job.validator_votes.items():
                approvals.setdefault(validator, 0)
                approvals[validator] += int(bool(vote))
        frame = AnalyticsFrame(
            timestamp=datetime.utcnow().isoformat() + "Z",
            cycle=cycle,
            energy_available=snapshot.energy_available,
            compute_available=snapshot.compute_available,
            treasury=snapshot.treasury,
            active_jobs=sum(1 for job in job_list if not job.is_terminal()),
            completed_jobs=sum(1 for job in job_list if job.status == JobStatus.COMPLETED),
            failed_jobs=sum(1 for job in job_list if job.status == JobStatus.FAILED),
            validator_votes=approvals,
        )
        await self.write_frame(frame)
