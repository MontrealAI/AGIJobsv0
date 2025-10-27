"""Long-running mission supervision utilities."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


@dataclass
class SupervisorConfig:
    summary_path: Path
    interval_seconds: float
    mission_target_hours: float


class LongRunSupervisor:
    """Background watcher that reinforces long-running stability."""

    def __init__(self, summary_path: Path, interval_seconds: float, mission_target_hours: float) -> None:
        self.config = SupervisorConfig(
            summary_path=summary_path,
            interval_seconds=max(1.0, float(interval_seconds)),
            mission_target_hours=max(0.1, float(mission_target_hours)),
        )
        self.config.summary_path.parent.mkdir(parents=True, exist_ok=True)
        self._start_time: datetime | None = None

    async def run(self, orchestrator: Any) -> None:
        """Start monitoring the orchestrator until it stops."""

        self._start_time = datetime.now(timezone.utc)
        while True:
            snapshot = orchestrator._collect_status_snapshot()
            summary = self._compose_summary(snapshot)
            await asyncio.to_thread(self._write_summary, summary)
            if not orchestrator._running and orchestrator._stopped.is_set():
                break
            await asyncio.sleep(self.config.interval_seconds)

    def _compose_summary(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        uptime_seconds = 0.0
        if self._start_time is not None:
            uptime_seconds = (now - self._start_time).total_seconds()
        mission_progress = self._estimate_progress(snapshot, uptime_seconds)
        return {
            "captured_at": now.isoformat(),
            "uptime_seconds": uptime_seconds,
            "mission_progress": mission_progress,
            "active_jobs": snapshot.get("jobs", {}).get("active_job_ids", []),
            "energy_available": snapshot.get("resources", {}).get("energy_available"),
            "compute_available": snapshot.get("resources", {}).get("compute_available"),
            "integrity": snapshot.get("integrity"),
        }

    def _estimate_progress(self, snapshot: Dict[str, Any], uptime_seconds: float) -> Dict[str, float]:
        jobs = snapshot.get("jobs", {})
        total_jobs = float(jobs.get("total", 0)) or 1.0
        completed = float(
            jobs.get("status_counts", {}).get("finalized", 0)
            + jobs.get("status_counts", {}).get("completed", 0)
        )
        ratio = min(1.0, completed / total_jobs)
        target_seconds = self.config.mission_target_hours * 3600.0
        time_ratio = min(1.0, uptime_seconds / target_seconds) if target_seconds else 1.0
        return {
            "job_completion": ratio,
            "time_elapsed": time_ratio,
        }

    def _write_summary(self, summary: Dict[str, Any]) -> None:
        self.config.summary_path.write_text(
            json.dumps(summary, indent=2, sort_keys=True),
            encoding="utf-8",
        )
