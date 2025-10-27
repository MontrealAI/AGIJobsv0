"""Omega-grade upgrade orchestrator with resilience and telemetry extensions."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from kardashev_ii_omega_grade_alpha_agi_business_3_demo.jobs import JobStatus
from kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo.orchestrator import (
    OmegaUpgradeOrchestrator,
)

from .config import OmegaOrchestratorV2Config
from .resilience import AsyncTaskRegistry, LongRunResilience
from .telemetry import MissionTelemetry


class OmegaUpgradeV2Orchestrator(OmegaUpgradeOrchestrator):
    """Augmented orchestrator that adds long-run resilience and telemetry."""

    config: OmegaOrchestratorV2Config

    def __init__(self, config: OmegaOrchestratorV2Config) -> None:
        super().__init__(config)
        self.config = config
        self._task_registry = AsyncTaskRegistry(self.log)
        self._telemetry_interval = max(1.0, float(getattr(config, "telemetry_interval_seconds", 20.0)))
        self._forecast_horizon_hours = float(getattr(config, "forecast_horizon_hours", 18.0))
        self._started_at: Optional[datetime] = None
        self._resilience = LongRunResilience(
            config.long_run_ledger_path,
            interval_seconds=float(getattr(config, "resilience_interval_seconds", 30.0)),
            retention_lines=int(getattr(config, "resilience_retention_lines", 1024)),
        )
        self._telemetry = MissionTelemetry(
            telemetry_path=config.telemetry_output_path,
            ui_payload_path=config.telemetry_ui_payload_path,
            mermaid_path=config.mermaid_output_path,
            max_nodes=int(getattr(config, "mermaid_max_nodes", 48)),
        )

    async def start(self) -> None:
        self._started_at = datetime.now(timezone.utc)
        await super().start()
        telemetry_task = asyncio.create_task(self._telemetry_loop(), name="omega-telemetry")
        resilience_task = asyncio.create_task(self._resilience_loop(), name="omega-resilience-ledger")
        self._task_registry.register("telemetry", telemetry_task)
        self._task_registry.register("resilience", resilience_task)
        self._tasks.append(telemetry_task)
        self._tasks.append(resilience_task)

    async def shutdown(self) -> None:
        await super().shutdown()
        snapshot = self.build_long_run_snapshot()
        await self._telemetry.record(snapshot)
        await self._resilience.persist(snapshot, force=True)

    def _handle_parameter_update(self, payload: Dict[str, Any]) -> None:  # type: ignore[override]
        super()._handle_parameter_update(payload)
        mission_updates = payload.get("mission")
        if not isinstance(mission_updates, dict):
            return
        updated: List[str] = []
        if "telemetry_interval_seconds" in mission_updates:
            self._telemetry_interval = max(1.0, float(mission_updates["telemetry_interval_seconds"]))
            updated.append("telemetry_interval_seconds")
        if "resilience_interval_seconds" in mission_updates:
            self._resilience.configure(interval_seconds=float(mission_updates["resilience_interval_seconds"]))
            updated.append("resilience_interval_seconds")
        if "resilience_retention_lines" in mission_updates:
            self._resilience.configure(retention_lines=int(mission_updates["resilience_retention_lines"]))
            updated.append("resilience_retention_lines")
        if "mermaid_max_nodes" in mission_updates:
            self._telemetry.configure(max_nodes=int(mission_updates["mermaid_max_nodes"]))
            updated.append("mermaid_max_nodes")
        if "forecast_horizon_hours" in mission_updates:
            self._forecast_horizon_hours = max(0.0, float(mission_updates["forecast_horizon_hours"]))
            updated.append("forecast_horizon_hours")
        if updated:
            self._info("mission_parameters_updated", fields=updated)

    async def _telemetry_loop(self) -> None:
        try:
            while self._running:
                await self._paused.wait()
                snapshot = self.build_long_run_snapshot()
                await self._telemetry.record(snapshot)
                await asyncio.sleep(max(1.0, float(self._telemetry_interval)))
        except asyncio.CancelledError:  # pragma: no cover - cooperative shutdown
            return

    async def _resilience_loop(self) -> None:
        try:
            while self._running:
                await self._paused.wait()
                snapshot = self.build_long_run_snapshot()
                await self._resilience.persist(snapshot)
                await asyncio.sleep(max(1.0, float(self._resilience.interval_seconds)))
        except asyncio.CancelledError:  # pragma: no cover - cooperative shutdown
            return

    def build_long_run_snapshot(self) -> Dict[str, Any]:
        base_snapshot = self._collect_status_snapshot()
        jobs = list(self.job_registry.iter_jobs())
        now = datetime.now(timezone.utc)
        horizon = timedelta(hours=max(0.0, self._forecast_horizon_hours))
        due_within_horizon = 0
        soonest_deadline: Optional[datetime] = None
        job_records: List[Dict[str, Any]] = []
        for job in jobs:
            deadline = job.spec.deadline
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)
            if deadline <= now + horizon and job.status in {JobStatus.POSTED, JobStatus.IN_PROGRESS}:
                due_within_horizon += 1
            if soonest_deadline is None or deadline < soonest_deadline:
                soonest_deadline = deadline
            job_records.append(
                {
                    "job_id": job.job_id,
                    "title": job.spec.title,
                    "status": job.status.value,
                    "parent_id": job.spec.parent_id,
                    "assigned_agent": job.assigned_agent,
                    "reward_tokens": job.spec.reward_tokens,
                    "stake_locked": job.stake_locked,
                    "deadline": deadline.isoformat(),
                    "energy_budget": job.spec.energy_budget,
                    "compute_budget": job.spec.compute_budget,
                    "metadata": dict(job.spec.metadata),
                }
            )
        base_snapshot["job_records"] = job_records
        base_snapshot["long_run"] = {
            "uptime_seconds": self.uptime_seconds,
            "forecast_horizon_hours": self._forecast_horizon_hours,
            "jobs_due_within_horizon": due_within_horizon,
            "soonest_deadline": soonest_deadline.isoformat() if soonest_deadline else None,
            "active_background_tasks": self._task_registry.active_tasks,
        }
        return base_snapshot

    @property
    def uptime_seconds(self) -> float:
        if self._started_at is None:
            return 0.0
        delta = datetime.now(timezone.utc) - self._started_at
        return max(0.0, delta.total_seconds())


__all__ = ["OmegaUpgradeV2Orchestrator"]
