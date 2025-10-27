"""Omega-grade upgrade orchestrator with autonomy guardian and resource governor."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from kardashev_ii_omega_grade_alpha_agi_business_3_demo.jobs import JobRecord, JobStatus
from kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo.orchestrator import (
    OmegaUpgradeOrchestrator,
)

from .config import OmegaOrchestratorV3Config
from .resilience import AsyncTaskRegistry, LongRunResilience
from .telemetry import MissionTelemetry


@dataclass(slots=True)
class GuardianEntry:
    job_id: str
    title: str
    status: str
    deadline: str
    assigned_agent: Optional[str]
    depth: int


class AutonomyGuardian:
    """Analyse the job graph and orchestrate long-run autonomy safeguards."""

    def __init__(
        self,
        plan_path: Path,
        history_path: Path,
        *,
        history_limit: int,
        deadline_threshold: timedelta,
        bus,
        logger,
    ) -> None:
        self.plan_path = plan_path
        self.history_path = history_path
        self.history_limit = max(1, int(history_limit))
        self.deadline_threshold = deadline_threshold
        self.bus = bus
        self.log = logger
        self.plan_path.parent.mkdir(parents=True, exist_ok=True)
        self.history_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()

    async def evaluate(self, orchestrator: "OmegaUpgradeV3Orchestrator") -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        jobs = list(orchestrator.job_registry.iter_jobs())
        outstanding = [
            job for job in jobs if job.status in {JobStatus.POSTED, JobStatus.IN_PROGRESS}
        ]
        root_jobs = [job for job in outstanding if not job.spec.parent_id]
        max_depth = 0
        entries: List[GuardianEntry] = []
        expedite: List[str] = []
        depth_memo: Dict[str, int] = {}
        for job in outstanding:
            depth = self._calculate_depth(orchestrator.job_registry, job, memo=depth_memo)
            max_depth = max(max_depth, depth)
            deadline = job.spec.deadline
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)
            entry = GuardianEntry(
                job_id=job.job_id,
                title=job.spec.title,
                status=job.status.value,
                deadline=deadline.isoformat(),
                assigned_agent=job.assigned_agent,
                depth=depth,
            )
            if deadline <= now + self.deadline_threshold and job.status == JobStatus.POSTED:
                entries.append(entry)
                if job.assigned_agent is None:
                    expedite.append(job.job_id)
        entries.sort(key=lambda item: item.deadline)
        resource_pressure = self._resource_pressure(orchestrator)
        report = {
            "timestamp": now.isoformat(),
            "outstanding_jobs": len(outstanding),
            "root_jobs": len(root_jobs),
            "near_deadline_jobs": [entry.__dict__ for entry in entries],
            "max_depth": max_depth,
            "resource_pressure": resource_pressure,
            "expedite_jobs": expedite,
            "paused": not orchestrator._paused.is_set(),
            "running": orchestrator._running,
        }
        if expedite:
            await self._broadcast_expedite(expedite, orchestrator)
        async with self._lock:
            await asyncio.to_thread(self._persist_report, report)
        return report

    async def _broadcast_expedite(
        self, job_ids: Sequence[str], orchestrator: "OmegaUpgradeV3Orchestrator"
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        for job_id in job_ids:
            await self.bus.publish(
                f"jobs:control:{job_id}",
                {
                    "job_id": job_id,
                    "action": "expedite",
                    "timestamp": now,
                },
                "autonomy-guardian",
            )
        if job_ids:
            await self.bus.publish(
                "jobs:expedite",
                {"jobs": list(job_ids), "timestamp": now},
                "autonomy-guardian",
            )
            self.log.info(
                "guardian_expedite",
                extra={"event": "guardian_expedite", "jobs": list(job_ids)},
            )

    def _resource_pressure(self, orchestrator: "OmegaUpgradeV3Orchestrator") -> Dict[str, float]:
        resources = orchestrator.resources
        energy_capacity = max(resources.energy_capacity, 1.0)
        compute_capacity = max(resources.compute_capacity, 1.0)
        energy_pressure = max(
            0.0, 1.0 - float(resources.energy_available) / float(energy_capacity)
        )
        compute_pressure = max(
            0.0, 1.0 - float(resources.compute_available) / float(compute_capacity)
        )
        locked_supply = float(getattr(resources, "locked_supply", 0.0))
        token_supply = float(getattr(resources, "token_supply", 0.0))
        token_pressure = (
            locked_supply / max(token_supply + locked_supply, 1.0)
        )
        return {
            "energy": round(energy_pressure, 6),
            "compute": round(compute_pressure, 6),
            "token": round(token_pressure, 6),
        }

    def _persist_report(self, report: Dict[str, Any]) -> None:
        self.plan_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        line = json.dumps(report, separators=(",", ":"))
        if self.history_path.exists():
            text = self.history_path.read_text(encoding="utf-8").splitlines()
        else:
            text = []
        text.append(line)
        trimmed = text[-self.history_limit :]
        self.history_path.write_text("\n".join(trimmed) + "\n", encoding="utf-8")

    def _calculate_depth(
        self,
        registry,
        job: JobRecord,
        memo: Optional[Dict[str, int]] = None,
    ) -> int:
        memo = memo or {}
        if job.job_id in memo:
            return memo[job.job_id]
        children = registry.children_of(job.job_id)
        if not children:
            memo[job.job_id] = 1
            return 1
        depth = 1 + max(self._calculate_depth(registry, child, memo) for child in children)
        memo[job.job_id] = depth
        return depth


class ResourceGovernor:
    """Dynamic resource pricing controller for planetary-scale utilisation."""

    def __init__(
        self,
        resources,
        *,
        target: float,
        smoothing: float,
        floor: float,
        ceiling: float,
    ) -> None:
        self.resources = resources
        self.target = max(0.0, min(0.99, float(target)))
        self.smoothing = max(0.01, float(smoothing))
        self.floor = max(0.01, float(floor))
        self.ceiling = max(self.floor, float(ceiling))
        self._last_state: Dict[str, Any] = {}

    def configure(
        self,
        *,
        target: Optional[float] = None,
        smoothing: Optional[float] = None,
        floor: Optional[float] = None,
        ceiling: Optional[float] = None,
    ) -> None:
        if target is not None:
            self.target = max(0.0, min(0.99, float(target)))
        if smoothing is not None:
            self.smoothing = max(0.01, float(smoothing))
        if floor is not None:
            self.floor = max(0.01, float(floor))
        if ceiling is not None:
            self.ceiling = max(self.floor, float(ceiling))

    def adjust(self) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        resources = self.resources
        energy_capacity = max(resources.energy_capacity, 1.0)
        compute_capacity = max(resources.compute_capacity, 1.0)
        energy_utilisation = 1.0 - float(resources.energy_available) / float(energy_capacity)
        compute_utilisation = 1.0 - float(resources.compute_available) / float(compute_capacity)

        def _adjust(current: float, utilisation: float) -> float:
            target_delta = utilisation - self.target
            candidate = current * (1.0 + self.smoothing * target_delta)
            return float(min(self.ceiling, max(self.floor, candidate)))

        current_energy_price = float(getattr(resources, "energy_price", 1.0) or 1.0)
        current_compute_price = float(getattr(resources, "compute_price", 1.0) or 1.0)
        energy_price = _adjust(current_energy_price, energy_utilisation)
        compute_price = _adjust(current_compute_price, compute_utilisation)
        resources.energy_price = energy_price
        resources.compute_price = compute_price
        state = {
            "timestamp": now.isoformat(),
            "energy_utilisation": round(energy_utilisation, 6),
            "compute_utilisation": round(compute_utilisation, 6),
            "target": self.target,
            "energy_price": energy_price,
            "compute_price": compute_price,
        }
        self._last_state = state
        return state

    @property
    def last_state(self) -> Dict[str, Any]:
        return dict(self._last_state)


class OmegaUpgradeV3Orchestrator(OmegaUpgradeOrchestrator):
    """Augmented orchestrator that adds long-run autonomy management."""

    config: OmegaOrchestratorV3Config

    def __init__(self, config: OmegaOrchestratorV3Config) -> None:
        super().__init__(config)
        self.config = config
        self._task_registry = AsyncTaskRegistry(self.log)
        self._telemetry_interval = max(1.0, float(getattr(config, "telemetry_interval_seconds", 15.0)))
        self._forecast_horizon_hours = float(getattr(config, "forecast_horizon_hours", 24.0))
        self._guardian_interval = max(1.0, float(getattr(config, "guardian_interval_seconds", 12.0)))
        deadline_threshold_minutes = float(
            getattr(config, "guardian_deadline_threshold_minutes", 60.0)
        )
        self._guardian = AutonomyGuardian(
            Path(getattr(config, "guardian_plan_path", Path("guardian-plan.json"))),
            Path(getattr(config, "guardian_history_path", Path("guardian-history.jsonl"))),
            history_limit=int(getattr(config, "guardian_history_lines", 4096)),
            deadline_threshold=timedelta(minutes=deadline_threshold_minutes),
            bus=self.bus,
            logger=self.log,
        )
        self._guardian_report: Optional[Dict[str, Any]] = None
        self._resource_governor = ResourceGovernor(
            self.resources,
            target=float(getattr(config, "resource_target_utilization", 0.75)),
            smoothing=float(getattr(config, "autonomy_price_smoothing", 0.35)),
            floor=float(getattr(config, "resource_price_floor", 0.25)),
            ceiling=float(getattr(config, "resource_price_ceiling", 12.0)),
        )
        self._governor_state: Dict[str, Any] = {}
        self._resource_feedback_interval = max(
            1.0, float(getattr(config, "resource_feedback_interval_seconds", 25.0))
        )
        self._resilience = LongRunResilience(
            Path(getattr(config, "long_run_ledger_path", Path("long-run-ledger.jsonl"))),
            interval_seconds=float(getattr(config, "resilience_interval_seconds", 20.0)),
            retention_lines=int(getattr(config, "resilience_retention_lines", 2048)),
        )
        self._telemetry = MissionTelemetry(
            telemetry_path=Path(getattr(config, "telemetry_output_path", Path("telemetry.json"))),
            ui_payload_path=Path(getattr(config, "telemetry_ui_payload_path", Path("telemetry-ui.json"))),
            mermaid_path=Path(getattr(config, "mermaid_output_path", Path("job-graph.mmd"))),
            max_nodes=int(getattr(config, "mermaid_max_nodes", 72)),
        )
        self._autonomy_checkpoint_path = Path(
            getattr(config, "autonomy_checkpoint_path", Path("autonomy-checkpoint.json"))
        )
        self._autonomy_checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        self._autonomy_lock = asyncio.Lock()
        self._started_at: Optional[datetime] = None
        self.bus.register_listener(self._control_hook)

    async def start(self) -> None:
        self._started_at = datetime.now(timezone.utc)
        await super().start()
        telemetry_task = asyncio.create_task(self._telemetry_loop(), name="omega-telemetry")
        resilience_task = asyncio.create_task(self._resilience_loop(), name="omega-resilience-ledger")
        guardian_task = asyncio.create_task(self._guardian_loop(), name="omega-guardian")
        governor_task = asyncio.create_task(
            self._resource_feedback_loop(), name="omega-resource-feedback"
        )
        checkpoint_task = asyncio.create_task(
            self._autonomy_checkpoint_loop(), name="omega-autonomy-checkpoint"
        )
        for label, task in (
            ("telemetry", telemetry_task),
            ("resilience", resilience_task),
            ("guardian", guardian_task),
            ("resource-governor", governor_task),
            ("autonomy-checkpoint", checkpoint_task),
        ):
            self._task_registry.register(label, task)
            self._tasks.append(task)

    async def shutdown(self) -> None:
        await super().shutdown()
        snapshot = self.build_long_run_snapshot()
        await self._telemetry.record(snapshot)
        await self._resilience.persist(snapshot, force=True)
        await asyncio.to_thread(self._write_autonomy_checkpoint, snapshot)

    async def _control_hook(self, topic: str, payload: Dict[str, Any], publisher: str) -> None:
        if topic != "control":
            return
        action = payload.get("action")
        if action == "emergency_stop":
            self._warning("emergency_stop_triggered", issuer=publisher)
            self.pause()
            await self.shutdown()

    def _handle_parameter_update(self, payload: Dict[str, Any]) -> None:  # type: ignore[override]
        super()._handle_parameter_update(payload)
        mission_updates = payload.get("mission")
        updated: List[str] = []
        if isinstance(mission_updates, dict):
            if "telemetry_interval_seconds" in mission_updates:
                self._telemetry_interval = max(
                    1.0, float(mission_updates["telemetry_interval_seconds"])
                )
                updated.append("telemetry_interval_seconds")
            if "resilience_interval_seconds" in mission_updates:
                self._resilience.configure(
                    interval_seconds=float(mission_updates["resilience_interval_seconds"])
                )
                updated.append("resilience_interval_seconds")
            if "resilience_retention_lines" in mission_updates:
                self._resilience.configure(
                    retention_lines=int(mission_updates["resilience_retention_lines"])
                )
                updated.append("resilience_retention_lines")
            if "mermaid_max_nodes" in mission_updates:
                self._telemetry.configure(
                    max_nodes=int(mission_updates["mermaid_max_nodes"])
                )
                updated.append("mermaid_max_nodes")
            if "forecast_horizon_hours" in mission_updates:
                self._forecast_horizon_hours = max(
                    0.0, float(mission_updates["forecast_horizon_hours"])
                )
                updated.append("forecast_horizon_hours")
            if "guardian_interval_seconds" in mission_updates:
                self._guardian_interval = max(
                    1.0, float(mission_updates["guardian_interval_seconds"])
                )
                updated.append("guardian_interval_seconds")
            if "guardian_deadline_threshold_minutes" in mission_updates:
                minutes = float(mission_updates["guardian_deadline_threshold_minutes"])
                self._guardian.deadline_threshold = timedelta(minutes=max(0.0, minutes))
                updated.append("guardian_deadline_threshold_minutes")
            if "guardian_history_lines" in mission_updates:
                self._guardian.history_limit = max(
                    1, int(mission_updates["guardian_history_lines"])
                )
                updated.append("guardian_history_lines")
            if "resource_feedback_interval_seconds" in mission_updates:
                self._resource_feedback_interval = max(
                    1.0, float(mission_updates["resource_feedback_interval_seconds"])
                )
                updated.append("resource_feedback_interval_seconds")
            if "resource_target_utilization" in mission_updates:
                self._resource_governor.configure(
                    target=float(mission_updates["resource_target_utilization"])
                )
                updated.append("resource_target_utilization")
            if "resource_price_floor" in mission_updates or "resource_price_ceiling" in mission_updates:
                self._resource_governor.configure(
                    floor=float(mission_updates.get("resource_price_floor", self._resource_governor.floor)),
                    ceiling=float(
                        mission_updates.get("resource_price_ceiling", self._resource_governor.ceiling)
                    ),
                )
                updated.extend([key for key in ("resource_price_floor", "resource_price_ceiling") if key in mission_updates])
            if "autonomy_price_smoothing" in mission_updates:
                self._resource_governor.configure(
                    smoothing=float(mission_updates["autonomy_price_smoothing"])
                )
                updated.append("autonomy_price_smoothing")
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

    async def _guardian_loop(self) -> None:
        try:
            while self._running:
                await self._paused.wait()
                report = await self._guardian.evaluate(self)
                self._guardian_report = report
                await asyncio.sleep(self._guardian_interval)
        except asyncio.CancelledError:  # pragma: no cover - cooperative shutdown
            return

    async def _resource_feedback_loop(self) -> None:
        try:
            while self._running:
                await self._paused.wait()
                self._governor_state = self._resource_governor.adjust()
                await asyncio.sleep(self._resource_feedback_interval)
        except asyncio.CancelledError:  # pragma: no cover - cooperative shutdown
            return

    async def _autonomy_checkpoint_loop(self) -> None:
        try:
            interval = max(self._guardian_interval * 2.0, 30.0)
            while self._running:
                await self._paused.wait()
                snapshot = self.build_long_run_snapshot()
                await asyncio.to_thread(self._write_autonomy_checkpoint, snapshot)
                await asyncio.sleep(interval)
        except asyncio.CancelledError:  # pragma: no cover - cooperative shutdown
            return

    def _write_autonomy_checkpoint(self, snapshot: Dict[str, Any]) -> None:
        payload = {
            "timestamp": snapshot.get("timestamp"),
            "mission": snapshot.get("mission"),
            "cycle": snapshot.get("cycle"),
            "autonomy": snapshot.get("autonomy"),
            "resources": snapshot.get("resources"),
            "jobs": snapshot.get("jobs"),
        }
        self._autonomy_checkpoint_path.write_text(
            json.dumps(payload, indent=2), encoding="utf-8"
        )

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
        base_snapshot["autonomy"] = {
            "guardian": self._guardian_report,
            "resource_governor": self._resource_governor.last_state or self._governor_state,
        }
        return base_snapshot

    @property
    def uptime_seconds(self) -> float:
        if self._started_at is None:
            return 0.0
        delta = datetime.now(timezone.utc) - self._started_at
        return max(0.0, delta.total_seconds())


__all__ = ["OmegaUpgradeV3Orchestrator"]
