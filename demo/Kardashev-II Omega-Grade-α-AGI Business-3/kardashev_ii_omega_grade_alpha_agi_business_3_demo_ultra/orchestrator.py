"""Ultra-grade orchestrator with planetary-scale resilience."""

from __future__ import annotations

import asyncio
import json
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Deque, Dict, Iterable, Optional, Set

from kardashev_ii_omega_grade_alpha_agi_business_3_demo.jobs import JobRecord, JobStatus
from kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo.orchestrator import (
    OmegaUpgradeOrchestrator,
)

from .config import MissionJobPlan, UltraDemoConfig, UltraMissionProfile


class UltraOrchestrator(OmegaUpgradeOrchestrator):
    """Omega upgrade orchestrator with ultra-grade long-run controls."""

    def __init__(self, config: UltraDemoConfig) -> None:
        super().__init__(config.orchestrator)
        self.demo_config = config
        self.mission: UltraMissionProfile = config.mission
        self._mission_start: Optional[datetime] = None
        self._archive_path = self.mission.archive_path
        self._archive_path.mkdir(parents=True, exist_ok=True)
        self._archive_history: Deque[Path] = deque()
        self._archive_limit = max(1, self.mission.checkpoint_rotation)
        self._deadline_warning_seconds = max(60.0, self.mission.deadline_warning_minutes * 60.0)
        self.bus.register_listener(self._on_bus_event)

    async def start(self) -> None:  # noqa: D401 - behaviour extended from base
        self._mission_start = datetime.now(timezone.utc)
        await super().start()
        self._tasks.append(asyncio.create_task(self._seed_plan_once(), name="ultra-plan"))
        self._tasks.append(
            asyncio.create_task(self._deadline_watchdog_loop(), name="ultra-deadline")
        )
        self._tasks.append(asyncio.create_task(self._archive_loop(), name="ultra-archive"))
        self._tasks.append(asyncio.create_task(self._uptime_monitor(), name="ultra-uptime"))

    async def _seed_plan_once(self) -> None:
        await self._paused.wait()
        existing_paths = {
            record.spec.metadata.get("plan_path")
            for record in self.job_registry.iter_jobs()
            if isinstance(record.spec.metadata.get("plan_path"), str)
        }
        for plan in self.mission.job_plan:
            await self._ensure_plan_node(plan, parent_id=None, existing_paths=existing_paths)
        self._info(
            "mission_plan_seeded",
            mission=self.mission.name,
            jobs=len(existing_paths) or len(self.mission.job_plan),
        )

    async def _ensure_plan_node(
        self,
        plan: MissionJobPlan,
        *,
        parent_id: Optional[str],
        existing_paths: Optional[Set[str]] = None,
    ) -> Optional[JobRecord]:
        if existing_paths is None:
            existing_paths = {
                plan_path
                for plan_path in (
                    record.spec.metadata.get("plan_path")
                    for record in self.job_registry.iter_jobs()
                )
                if isinstance(plan_path, str)
            }
        job: Optional[JobRecord] = None
        if plan.plan_path in existing_paths:
            job = self._job_by_plan_path(plan.plan_path)
        if job is None:
            spec = plan.instantiate(parent_id=parent_id)
            metadata = dict(spec.metadata)
            metadata.setdefault("mission", self.mission.name)
            metadata.setdefault("vision", self.mission.vision)
            spec.metadata = metadata
            try:
                job = await self.post_alpha_job(spec)
                existing_paths.add(plan.plan_path)
            except ValueError as exc:
                self._warning(
                    "plan_post_failed",
                    plan_path=plan.plan_path,
                    error=str(exc),
                )
                return None
        for child in plan.children:
            await self._ensure_plan_node(
                child,
                parent_id=job.job_id if job else parent_id,
                existing_paths=existing_paths,
            )
        return job

    def _job_by_plan_path(self, plan_path: str) -> Optional[JobRecord]:
        for record in self.job_registry.iter_jobs():
            if record.spec.metadata.get("plan_path") == plan_path:
                return record
        return None

    async def _deadline_watchdog_loop(self) -> None:
        while self._running:
            await self._paused.wait()
            now = datetime.now(timezone.utc)
            for job in list(self.job_registry.iter_jobs()):
                if job.status not in {JobStatus.POSTED, JobStatus.IN_PROGRESS}:
                    continue
                delta = (job.spec.deadline - now).total_seconds()
                if 0 < delta <= self._deadline_warning_seconds:
                    await self.bus.publish(
                        f"jobs:{job.job_id}:control",
                        {
                            "action": "deadline_warning",
                            "plan_path": job.spec.metadata.get("plan_path"),
                            "deadline": job.spec.deadline.isoformat(),
                            "seconds_remaining": delta,
                        },
                        "ultra-orchestrator",
                    )
                    self._info(
                        "deadline_warning",
                        job_id=job.job_id,
                        seconds_remaining=round(delta, 2),
                        plan_path=job.spec.metadata.get("plan_path"),
                    )
            await asyncio.sleep(min(self._deadline_warning_seconds / 3.0, 120.0))

    async def _archive_loop(self) -> None:
        while self._running:
            await self._paused.wait()
            await asyncio.sleep(self.mission.archive_interval_seconds)
            await self._write_archive_snapshot()

    async def _write_archive_snapshot(self) -> None:
        payload = {
            "mission": {
                "name": self.mission.name,
                "vision": self.mission.vision,
                "runtime_hours": self.mission.runtime_hours,
                "started_at": self._mission_start.isoformat() if self._mission_start else None,
            },
            "resources": self.resources.to_serializable(),
            "jobs": {
                record.job_id: record.to_serializable()
                for record in self.job_registry.iter_jobs()
            },
        }
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        archive_file = self._archive_path / f"snapshot-{timestamp}.json"
        archive_file.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        self._archive_history.append(archive_file)
        while len(self._archive_history) > self._archive_limit:
            old = self._archive_history.popleft()
            try:
                old.unlink()
            except FileNotFoundError:
                pass
        self._info("archive_snapshot_written", path=str(archive_file))

    async def _uptime_monitor(self) -> None:
        while self._running:
            await self._paused.wait()
            if not self._mission_start:
                await asyncio.sleep(5.0)
                continue
            elapsed = (datetime.now(timezone.utc) - self._mission_start).total_seconds()
            if elapsed >= self.mission.runtime_hours * 3600.0:
                self._info("mission_runtime_reached", hours=self.mission.runtime_hours)
                asyncio.create_task(self.shutdown(), name="ultra-autoshutdown")
                return
            await asyncio.sleep(30.0)

    async def _on_bus_event(self, topic: str, payload: Dict[str, Any], publisher: str) -> None:
        if topic.startswith("results:") and payload.get("status") == "finalized":
            plan_path = payload.get("plan_path") or payload.get("metadata", {}).get("plan_path")
            if isinstance(plan_path, str):
                await self._maybe_schedule_followups(plan_path)

    async def _maybe_schedule_followups(self, plan_path: str) -> None:
        node = self._find_plan_node(plan_path)
        if not node:
            return
        parent_job = self._job_by_plan_path(plan_path)
        parent_id = parent_job.job_id if parent_job else None
        for child in node.children:
            if self._job_by_plan_path(child.plan_path):
                continue
            await self._ensure_plan_node(child, parent_id=parent_id)

    def _find_plan_node(self, plan_path: str) -> Optional[MissionJobPlan]:
        def _search(nodes: Iterable[MissionJobPlan]) -> Optional[MissionJobPlan]:
            for node in nodes:
                if node.plan_path == plan_path:
                    return node
                found = _search(node.children)
                if found:
                    return found
            return None

        return _search(self.mission.job_plan)


__all__ = ["UltraOrchestrator"]
