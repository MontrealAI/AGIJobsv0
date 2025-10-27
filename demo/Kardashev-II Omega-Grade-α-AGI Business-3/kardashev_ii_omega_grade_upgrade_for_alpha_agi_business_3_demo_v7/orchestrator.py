"""Omega-grade upgrade orchestrator with narrative UX, autonomy guardian, and resource governor."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional, Sequence, Coroutine

from kardashev_ii_omega_grade_alpha_agi_business_3_demo.jobs import JobRecord, JobStatus, JobSpec
from kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo.orchestrator import (
    OmegaUpgradeOrchestrator,
)

from .config import OmegaOrchestratorV7Config
from .continuity import ContinuityReplica, ContinuityVault
from .council import ValidatorCouncil
from .resilience import AsyncTaskRegistry, LongRunResilience
from .telemetry import MissionTelemetry
from .storyboard import MissionStoryBoard


@dataclass(slots=True)
class StateSnapshot:
    """Serializable checkpoint of the orchestrator's planetary state."""

    timestamp: str
    cycle: int
    running: bool
    paused: bool
    outstanding_jobs: int
    in_progress_jobs: int
    root_jobs: int
    resources: Dict[str, float]
    guardian: Optional[Dict[str, Any]] = None
    council: Optional[Dict[str, Any]] = None
    continuity: Optional[Dict[str, Any]] = None


class LongRunStateManager:
    """Persist orchestrator state for multi-hour/day continuity."""

    def __init__(
        self,
        checkpoint_path: Path,
        history_path: Path,
        *,
        history_limit: int,
        logger,
    ) -> None:
        self.checkpoint_path = checkpoint_path
        self.history_path = history_path
        self.history_limit = max(1, int(history_limit))
        self.log = logger
        self.checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        self.history_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()

    async def persist(self, snapshot: StateSnapshot | Dict[str, Any]) -> None:
        payload = snapshot if isinstance(snapshot, dict) else asdict(snapshot)
        async with self._lock:
            await asyncio.to_thread(self._persist_sync, payload)

    def _persist_sync(self, payload: Dict[str, Any]) -> None:
        self.checkpoint_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        line = json.dumps(payload, separators=(",", ":"))
        if self.history_path.exists():
            history = self.history_path.read_text(encoding="utf-8").splitlines()
        else:
            history = []
        history.append(line)
        trimmed = history[-self.history_limit :]
        self.history_path.write_text("\n".join(trimmed) + "\n", encoding="utf-8")
        self.log.debug(
            "state_checkpoint_persisted",
            extra={"event": "state_checkpoint", "path": str(self.checkpoint_path)},
        )



class StructuredLogWriter:
    """Append structured JSONL events for long-running missions."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()

    def write(self, event: str, **fields: Any) -> None:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event": event,
            **fields,
        }
        line = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        with self._lock:
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")


class BackgroundWorkPool:
    """Bounded background task manager for long-running async jobs."""

    def __init__(self, limit: int, logger) -> None:
        self._limit = max(1, int(limit))
        self._logger = logger
        self._semaphore = asyncio.Semaphore(self._limit)
        self._tasks: Dict[str, asyncio.Task[Any]] = {}
        self._lock = asyncio.Lock()

    async def start(self, label: str, coroutine: Coroutine[Any, Any, Any]) -> None:
        await self._semaphore.acquire()
        async with self._lock:
            if label in self._tasks:
                self._semaphore.release()
                raise ValueError(f"Background task {label} already running")
            task = asyncio.create_task(self._wrap(label, coroutine), name=f"omega-bg:{label}")
            self._tasks[label] = task

    async def cancel(self, label: str) -> None:
        async with self._lock:
            task = self._tasks.pop(label, None)
        if task is not None:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def shutdown(self) -> None:
        async with self._lock:
            tasks = list(self._tasks.values())
            self._tasks.clear()
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _wrap(self, label: str, coroutine: Coroutine[Any, Any, Any]) -> None:
        try:
            await coroutine
        except asyncio.CancelledError:  # pragma: no cover - cooperative cancellation
            raise
        except Exception as exc:  # pragma: no cover - defensive guard
            self._logger.error(
                "background_task_failed",
                extra={"event": "background_task_failed", "label": label, "error": str(exc)},
            )
        finally:
            async with self._lock:
                self._tasks.pop(label, None)
            self._semaphore.release()


class DelegationEngine:
    """Coordinate recursive delegation reminders and dependency tracking."""

    def __init__(
        self,
        *,
        retry_seconds: float,
        background_pool: BackgroundWorkPool,
        bus,
        logger,
    ) -> None:
        self.retry_seconds = max(5.0, float(retry_seconds))
        self._pool = background_pool
        self._bus = bus
        self._logger = logger
        self._graph: Dict[str, List[str]] = {}

    def register(self, orchestrator: "OmegaUpgradeV7Orchestrator", job: JobRecord) -> None:
        parent = job.spec.parent_id
        if parent:
            self._graph.setdefault(parent, []).append(job.job_id)
        asyncio.create_task(
            self._pool.start(
                f"delegation:{job.job_id}",
                self._monitor(orchestrator, job.job_id),
            ),
            name=f"delegation-register:{job.job_id}",
        )

    def complete(self, job_id: str) -> None:
        asyncio.create_task(self._pool.cancel(f"delegation:{job_id}"))
        for children in self._graph.values():
            if job_id in children:
                children.remove(job_id)

    async def _monitor(self, orchestrator: "OmegaUpgradeV7Orchestrator", job_id: str) -> None:
        await asyncio.sleep(self.retry_seconds)
        while orchestrator._running:
            await orchestrator._paused.wait()
            job = orchestrator.job_registry.get_job(job_id)
            if job.status in {JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.FAILED, JobStatus.FINALIZED}:
                break
            if job.status == JobStatus.POSTED and not job.assigned_agent:
                await self._bus.publish(
                    f"jobs:reminder:{job_id}",
                    {"job_id": job_id, "title": job.spec.title},
                    "delegation-engine",
                )
                self._logger.info(
                    "delegation_reminder",
                    extra={"event": "delegation_reminder", "job_id": job_id},
                )
            await asyncio.sleep(self.retry_seconds)


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

    async def evaluate(self, orchestrator: "OmegaUpgradeV7Orchestrator") -> Dict[str, Any]:
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
            if job.status == JobStatus.POSTED:
                posted_jobs += 1
            elif job.status == JobStatus.IN_PROGRESS:
                in_progress_jobs += 1
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
        self, job_ids: Sequence[str], orchestrator: "OmegaUpgradeV7Orchestrator"
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

    def _resource_pressure(self, orchestrator: "OmegaUpgradeV7Orchestrator") -> Dict[str, float]:
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


def _coerce_continuity_payload(payload: Sequence[Dict[str, Any]]) -> List[Dict[str, Path]]:
    replicas: List[Dict[str, Path]] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        path_value = entry.get("path")
        if name is None or path_value is None:
            continue
        path = Path(path_value) if not isinstance(path_value, Path) else path_value
        replicas.append({"name": str(name), "path": path})
    if not replicas:
        replicas = [{"name": "primary", "path": Path("continuity-primary.json")}]  # pragma: no cover - defensive default
    return replicas


class OmegaUpgradeV7Orchestrator(OmegaUpgradeOrchestrator):
    """Augmented orchestrator that adds v7 continuity, council, and audit loops."""

    config: OmegaOrchestratorV7Config

    def __init__(self, config: OmegaOrchestratorV7Config) -> None:
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
            job_graph_path=Path(getattr(config, "job_graph_json_path", Path("job-graph.json"))),
        )
        self._autonomy_checkpoint_path = Path(
            getattr(config, "autonomy_checkpoint_path", Path("autonomy-checkpoint.json"))
        )
        self._autonomy_checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        self._storyboard = MissionStoryBoard(
            storyboard_path=Path(getattr(config, "storyboard_path", Path("storyboard.json"))),
            history_path=Path(getattr(config, "storyboard_history_path", Path("storyboard-history.jsonl"))),
            history_limit=int(getattr(config, "storyboard_history_lines", 2048)),
            insight_path=Path(getattr(config, "insight_journal_path", Path("insights.jsonl"))),
            insight_limit=int(getattr(config, "insight_history_lines", 4096)),
            mission_manifest_path=Path(
                getattr(config, "mission_manifest_path", Path("mission-manifest.json"))
            ),
            mission_name=config.mission_name,
        )
        self._structured_log = StructuredLogWriter(
            Path(getattr(config, "structured_log_path", Path("structured-log.jsonl")))
        )
        self._state_manager = LongRunStateManager(
            checkpoint_path=Path(
                getattr(config, "state_checkpoint_path", Path("state-checkpoint.json"))
            ),
            history_path=Path(
                getattr(config, "state_history_path", Path("state-history.jsonl"))
            ),
            history_limit=int(getattr(config, "state_history_lines", 4096)),
            logger=self.log,
        )
        self._background_pool = BackgroundWorkPool(
            limit=int(getattr(config, "background_task_limit", 64)),
            logger=self.log,
        )
        self._delegation_engine = DelegationEngine(
            retry_seconds=float(getattr(config, "delegation_retry_seconds", 90.0)),
            background_pool=self._background_pool,
            bus=self.bus,
            logger=self.log,
        )
        self._tracked_delegations: set[str] = set()
        self._checkpoint_interval = max(
            30.0, float(getattr(config, "checkpoint_interval_seconds", 120.0))
        )
        self._validator_timeout_seconds = max(
            60.0, float(getattr(config, "validator_vote_timeout_seconds", 600.0))
        )
        commit_window_seconds = float(
            getattr(config, "validator_commit_window_seconds", 300.0)
        )
        reveal_window_seconds = float(
            getattr(config, "validator_reveal_window_seconds", 600.0)
        )
        self._validator_commit_window_seconds = commit_window_seconds
        self._validator_reveal_window_seconds = reveal_window_seconds
        self._validator_council = ValidatorCouncil(
            commit_window=timedelta(seconds=self._validator_commit_window_seconds),
            reveal_window=timedelta(seconds=self._validator_reveal_window_seconds),
            logger=self.log,
        )
        self._simulation_tick_seconds = max(
            1.0, float(getattr(config, "simulation_tick_seconds", 45.0))
        )
        self._simulation_hours_per_tick = max(
            0.1, float(getattr(config, "simulation_hours_per_tick", 4.0))
        )
        replicas_payload = _coerce_continuity_payload(getattr(config, "continuity_replicas", []))
        replicas = [
            ContinuityReplica(name=entry["name"], path=entry["path"]) for entry in replicas_payload
        ]
        continuity_history_path = Path(
            getattr(
                config,
                "continuity_history_path",
                Path("artifacts/status/omega-upgrade-v7/continuity-history.jsonl"),
            )
        )
        self._continuity_vault = ContinuityVault(
            replicas,
            history_path=continuity_history_path,
            history_limit=int(getattr(config, "continuity_history_lines", 4096)),
            logger=self.log,
        )
        self._continuity_interval = max(
            30.0, float(getattr(config, "continuity_interval_seconds", 180.0))
        )
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
        state_checkpoint_task = asyncio.create_task(
            self._state_checkpoint_loop(), name="omega-state-checkpoint"
        )
        delegation_task = asyncio.create_task(
            self._delegation_monitor_loop(), name="omega-delegation-monitor"
        )
        validator_task = asyncio.create_task(
            self._validator_watchdog_loop(), name="omega-validator-watchdog"
        )
        continuity_task = asyncio.create_task(
            self._continuity_vault_loop(), name="omega-continuity-vault"
        )
        simulation_task: Optional[asyncio.Task[None]] = None
        if getattr(self, "simulation", None) is not None:
            simulation_task = asyncio.create_task(
                self._simulation_bridge_loop(), name="omega-simulation-bridge"
            )
        for label, task in (
            ("telemetry", telemetry_task),
            ("resilience", resilience_task),
            ("guardian", guardian_task),
            ("resource-governor", governor_task),
            ("autonomy-checkpoint", checkpoint_task),
            ("state-checkpoint", state_checkpoint_task),
            ("delegation-monitor", delegation_task),
            ("validator-watchdog", validator_task),
            ("continuity-vault", continuity_task),
        ):
            self._task_registry.register(label, task)
            self._tasks.append(task)
        if simulation_task is not None:
            self._task_registry.register("simulation-bridge", simulation_task)
            self._tasks.append(simulation_task)

    async def shutdown(self) -> None:
        await super().shutdown()
        await self._background_pool.shutdown()
        snapshot = self.build_long_run_snapshot()
        await self._telemetry.record(snapshot)
        await self._resilience.persist(snapshot, force=True)
        await self._storyboard.capture(snapshot)
        await asyncio.to_thread(self._write_autonomy_checkpoint, snapshot)
        await self._state_manager.persist(self._build_state_snapshot())
        await self._continuity_vault.persist(snapshot)

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
            if "storyboard_history_lines" in mission_updates:
                self._storyboard.configure(
                    history_limit=int(mission_updates["storyboard_history_lines"])
                )
                updated.append("storyboard_history_lines")
            if "insight_history_lines" in mission_updates:
                self._storyboard.configure(
                    insight_history_limit=int(mission_updates["insight_history_lines"])
                )
                updated.append("insight_history_lines")
            if "continuity_interval_seconds" in mission_updates:
                self._continuity_interval = max(
                    30.0, float(mission_updates["continuity_interval_seconds"])
                )
                updated.append("continuity_interval_seconds")
            if "continuity_history_lines" in mission_updates:
                self._continuity_vault.configure(
                    history_limit=int(mission_updates["continuity_history_lines"])
                )
                updated.append("continuity_history_lines")
            if "continuity_replicas" in mission_updates:
                payload = _coerce_continuity_payload(mission_updates["continuity_replicas"])
                replicas = [
                    ContinuityReplica(name=entry["name"], path=entry["path"])
                    for entry in payload
                ]
                self._continuity_vault.configure(replicas=replicas)
                updated.append("continuity_replicas")
            if "validator_commit_window_seconds" in mission_updates:
                self._validator_commit_window_seconds = float(
                    mission_updates["validator_commit_window_seconds"]
                )
                self._validator_council = ValidatorCouncil(
                    commit_window=timedelta(seconds=self._validator_commit_window_seconds),
                    reveal_window=timedelta(seconds=self._validator_reveal_window_seconds),
                    logger=self.log,
                )
                updated.append("validator_commit_window_seconds")
            if "validator_reveal_window_seconds" in mission_updates:
                self._validator_reveal_window_seconds = float(
                    mission_updates["validator_reveal_window_seconds"]
                )
                self._validator_council = ValidatorCouncil(
                    commit_window=timedelta(seconds=self._validator_commit_window_seconds),
                    reveal_window=timedelta(seconds=self._validator_reveal_window_seconds),
                    logger=self.log,
                )
                updated.append("validator_reveal_window_seconds")
        if updated:
            self._info("mission_parameters_updated", fields=updated)

    async def _telemetry_loop(self) -> None:
        try:
            while self._running:
                await self._paused.wait()
                snapshot = self.build_long_run_snapshot()
                await self._telemetry.record(snapshot)
                await self._storyboard.capture(snapshot)
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

    async def _continuity_vault_loop(self) -> None:
        try:
            while self._running:
                await self._paused.wait()
                snapshot = self.build_long_run_snapshot()
                await self._continuity_vault.persist(snapshot)
                await asyncio.sleep(self._continuity_interval)
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

    async def post_alpha_job(self, spec: JobSpec) -> JobRecord:  # type: ignore[override]
        record = await super().post_alpha_job(spec)
        if record.job_id not in self._tracked_delegations:
            self._tracked_delegations.add(record.job_id)
            self._delegation_engine.register(self, record)
        self._structured_log.write(
            "job_posted",
            job_id=record.job_id,
            parent_id=record.spec.parent_id,
            title=record.spec.title,
            reward_tokens=record.spec.reward_tokens,
            deadline=record.spec.deadline.isoformat(),
        )
        return record

    def _build_state_snapshot(self) -> StateSnapshot:
        now = datetime.now(timezone.utc).isoformat()
        jobs = list(self.job_registry.iter_jobs())
        outstanding = sum(1 for job in jobs if job.status == JobStatus.POSTED)
        in_progress = sum(1 for job in jobs if job.status == JobStatus.IN_PROGRESS)
        root_jobs = sum(1 for job in jobs if not job.spec.parent_id)
        resources_snapshot = {
            "energy_available": float(self.resources.energy_available),
            "compute_available": float(self.resources.compute_available),
            "energy_capacity": float(self.resources.energy_capacity),
            "compute_capacity": float(self.resources.compute_capacity),
            "token_supply": float(getattr(self.resources, "token_supply", 0.0)),
        }
        continuity_snapshot = {
            "interval_seconds": self._continuity_interval,
            "history_limit": self._continuity_vault.history_limit,
            "replicas": [
                {"name": replica.name, "path": str(replica.path)}
                for replica in self._continuity_vault.replicas
            ],
        }
        council_snapshot = {
            "commit_window_seconds": self._validator_commit_window_seconds,
            "reveal_window_seconds": self._validator_reveal_window_seconds,
            "validators": list(self.config.validator_names),
            "open_jobs": sum(
                1
                for job in jobs
                if job.status == JobStatus.COMPLETED
                and len(job.validator_votes) < len(job.validators_with_stake)
            ),
            "reveals_recorded": sum(len(job.validator_votes) for job in jobs),
        }
        return StateSnapshot(
            timestamp=now,
            cycle=self._cycle,
            running=self._running,
            paused=not self._paused.is_set(),
            outstanding_jobs=outstanding,
            in_progress_jobs=in_progress,
            root_jobs=root_jobs,
            resources=resources_snapshot,
            guardian=self._guardian_report,
            council=council_snapshot,
            continuity=continuity_snapshot,
        )

    async def _state_checkpoint_loop(self) -> None:
        try:
            while self._running:
                await self._paused.wait()
                snapshot = self._build_state_snapshot()
                await self._state_manager.persist(snapshot)
                await asyncio.sleep(self._checkpoint_interval)
        except asyncio.CancelledError:  # pragma: no cover - cooperative shutdown
            return

    async def _delegation_monitor_loop(self) -> None:
        try:
            while self._running:
                await self._paused.wait()
                for tracked in list(self._tracked_delegations):
                    job = self.job_registry.get_job(tracked)
                    if job.status not in {JobStatus.POSTED, JobStatus.IN_PROGRESS}:
                        self._delegation_engine.complete(tracked)
                        self._tracked_delegations.discard(tracked)
                for job in self.job_registry.iter_jobs():
                    if job.job_id in self._tracked_delegations:
                        continue
                    if job.status not in {JobStatus.POSTED, JobStatus.IN_PROGRESS}:
                        continue
                    self._tracked_delegations.add(job.job_id)
                    self._delegation_engine.register(self, job)
                await asyncio.sleep(max(15.0, self._checkpoint_interval / 2.0))
        except asyncio.CancelledError:  # pragma: no cover - cooperative shutdown
            return

    async def _initiate_validation(self, job: JobRecord) -> None:  # type: ignore[override]
        await super()._initiate_validation(job)
        validators = tuple(job.validators_with_stake) or tuple(self.config.validator_names)
        await self._validator_council.stage_commits(job.job_id, validators)

    async def _handle_reveal(self, job_id: str, validator: str, vote: bool) -> None:  # type: ignore[override]
        verdict = "approve" if vote else "reject"
        await self._validator_council.record_reveal(job_id, validator, verdict)
        await super()._handle_reveal(job_id, validator, vote)

    async def _validator_watchdog_loop(self) -> None:
        try:
            interval = max(30.0, self._validator_timeout_seconds / 3.0)
            while self._running:
                await self._paused.wait()
                now = datetime.now(timezone.utc)
                for job in self.job_registry.iter_jobs():
                    if job.status != JobStatus.COMPLETED:
                        continue
                    pending = set(job.validators_with_stake) - set(job.validator_votes.keys())
                    if not pending:
                        continue
                    if job.reveal_deadline and now <= job.reveal_deadline:
                        continue
                    for validator in pending:
                        await self.bus.publish(
                            f"validation:reminder:{job.job_id}",
                            {
                                "validator": validator,
                                "job_id": job.job_id,
                                "reveal_deadline": job.reveal_deadline.isoformat()
                                if job.reveal_deadline
                                else None,
                            },
                            "validator-watchdog",
                        )
                    self._warning(
                        "validator_reminder_issued",
                        job_id=job.job_id,
                        pending=list(pending),
                    )
                await asyncio.sleep(interval)
                await self._validator_council.prune(
                    job.job_id for job in self.job_registry.iter_jobs()
                )
        except asyncio.CancelledError:  # pragma: no cover - cooperative shutdown
            return

    def _build_job_graph(self, jobs: Sequence[JobRecord]) -> List[Dict[str, Any]]:
        """Return a breadth-first ordered job graph for telemetry exports."""

        children: Dict[str, List[str]] = {job.job_id: [] for job in jobs}
        roots: List[str] = []
        for job in jobs:
            parent = job.spec.parent_id
            if parent and parent in children:
                children[parent].append(job.job_id)
            else:
                roots.append(job.job_id)
        ordered_roots: List[str] = []
        for job_id in roots:
            if job_id not in ordered_roots:
                ordered_roots.append(job_id)
        if not ordered_roots:
            ordered_roots = list(children.keys())
        queue: List[tuple[str, int]] = [(job_id, 0) for job_id in ordered_roots]
        visited: set[str] = set()
        ordered: List[Dict[str, Any]] = []
        while queue:
            job_id, depth = queue.pop(0)
            if job_id in visited:
                continue
            visited.add(job_id)
            record = self.job_registry.get_job(job_id)
            deadline = record.spec.deadline
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)
            descendants = children.get(job_id, [])
            ordered.append(
                {
                    "job_id": record.job_id,
                    "title": record.spec.title,
                    "status": record.status.value,
                    "parent_id": record.spec.parent_id,
                    "assigned_agent": record.assigned_agent,
                    "depth": depth,
                    "children": list(descendants),
                    "deadline": deadline.isoformat(),
                    "reward_tokens": record.spec.reward_tokens,
                }
            )
            for child in descendants:
                queue.append((child, depth + 1))
        return ordered



    async def _simulation_bridge_loop(self) -> None:
        try:
            while self._running:
                await self._paused.wait()
                state = getattr(self, "_latest_simulation_state", None)
                if state is not None:
                    payload = {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "energy_output_gw": getattr(state, "energy_output_gw", None),
                        "prosperity_index": getattr(state, "prosperity_index", None),
                        "sustainability_index": getattr(state, "sustainability_index", None),
                    }
                    await self.bus.publish(
                        "simulation:state", payload, "simulation-bridge"
                    )
                await asyncio.sleep(self._simulation_tick_seconds)
        except asyncio.CancelledError:  # pragma: no cover - cooperative shutdown
            return

    def build_long_run_snapshot(self) -> Dict[str, Any]:
        base_snapshot = self._collect_status_snapshot()
        jobs = list(self.job_registry.iter_jobs())
        posted_jobs = 0
        in_progress_jobs = 0
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
        posted_jobs = sum(1 for job in jobs if job.status == JobStatus.POSTED)
        in_progress_jobs = sum(1 for job in jobs if job.status == JobStatus.IN_PROGRESS)
        base_snapshot["job_records"] = job_records
        base_snapshot["job_graph"] = self._build_job_graph(jobs)
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
        base_snapshot["mission_summary"] = self._build_mission_summary(base_snapshot)
        self._structured_log.write(
            "long_run_snapshot",
            cycle=int(base_snapshot.get("cycle", 0) or 0),
            posted=posted_jobs,
            in_progress=in_progress_jobs,
            energy_available=float(self.resources.energy_available),
            compute_available=float(self.resources.compute_available),
        )
        return base_snapshot

    @property
    def uptime_seconds(self) -> float:
        if self._started_at is None:
            return 0.0
        delta = datetime.now(timezone.utc) - self._started_at
        return max(0.0, delta.total_seconds())

    def _build_mission_summary(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        jobs_meta = snapshot.get("jobs", {})
        status_counts = jobs_meta.get("status_counts", {})
        posted = float(status_counts.get("posted", 0.0))
        in_progress = float(status_counts.get("in_progress", 0.0))
        finalized = float(status_counts.get("finalized", 0.0))
        completed = float(status_counts.get("completed", 0.0))
        cancelled = float(status_counts.get("cancelled", 0.0))
        failed = float(status_counts.get("failed", 0.0))
        outstanding = posted + in_progress
        total_jobs = outstanding + finalized + completed + cancelled + failed

        long_run = snapshot.get("long_run", {})
        backlog = float(long_run.get("jobs_due_within_horizon", 0.0))
        resources = snapshot.get("resources", {})

        def _utilisation(capacity: float, available: float) -> float:
            if capacity <= 0:
                return 0.0
            return max(0.0, min(1.0, 1.0 - available / capacity))

        energy_capacity = float(resources.get("energy_capacity") or 0.0)
        energy_available = float(resources.get("energy_available") or 0.0)
        compute_capacity = float(resources.get("compute_capacity") or 0.0)
        compute_available = float(resources.get("compute_available") or 0.0)
        energy_utilisation = _utilisation(energy_capacity, energy_available)
        compute_utilisation = _utilisation(compute_capacity, compute_available)

        guardian = snapshot.get("autonomy", {}).get("guardian") or {}
        guardian_alerts: List[Dict[str, Any]] = guardian.get("near_deadline_jobs", [])
        expedite_jobs: List[str] = guardian.get("expedite_jobs", []) if guardian else []
        governor = snapshot.get("autonomy", {}).get("resource_governor") or {}

        outstanding_reference = outstanding if outstanding > 0 else 1.0
        backlog_pressure = max(0.0, min(1.0, backlog / outstanding_reference))
        token_supply = float(resources.get("token_supply") or 0.0)
        locked_supply = float(resources.get("locked_supply") or 0.0)
        token_pressure = 0.0
        if token_supply + locked_supply > 0:
            token_pressure = locked_supply / (token_supply + locked_supply)

        max_pressure = max(energy_utilisation, compute_utilisation, backlog_pressure, token_pressure)
        confidence = max(0.0, min(1.0, 1.0 - max_pressure))

        if confidence >= 0.85:
            headline = "Mission operating at stellar efficiency"
            phase = "ascendant"
        elif confidence >= 0.6:
            headline = "Mission stable with minor optimisation opportunities"
            phase = "stabilisation"
        else:
            headline = "Mission requires operator guidance"
            phase = "intervention"

        actions: List[str] = []
        if energy_utilisation > 0.7:
            actions.append("Top up planetary energy credits or defer energy-intensive jobs.")
        if compute_utilisation > 0.7:
            actions.append("Provision additional compute or reprice heavy workloads.")
        if backlog_pressure > 0.6:
            actions.append("Accelerate delegation or approve more specialists to clear backlog.")
        if expedite_jobs:
            actions.append(
                f"Authorise rapid response on jobs {', '.join(expedite_jobs[:3])}" +
                ("…" if len(expedite_jobs) > 3 else "")
            )
        if not actions:
            actions.append("No intervention required—autonomous mission is progressing smoothly.")

        summary_text = (
            f"Ω mission running with confidence {confidence:.2%}. "
            f"{outstanding:.0f} jobs active, {finalized + completed:.0f} completed, {backlog:.0f} queued in horizon."
        )

        return {
            "headline": headline,
            "phase": phase,
            "confidence": round(confidence, 4),
            "summary": summary_text,
            "outstanding_jobs": int(outstanding),
            "total_jobs": int(total_jobs),
            "jobs_completed": int(finalized + completed),
            "jobs_failed": int(failed),
            "jobs_cancelled": int(cancelled),
            "backlog_horizon": int(backlog),
            "energy_utilisation": round(energy_utilisation, 4),
            "compute_utilisation": round(compute_utilisation, 4),
            "token_pressure": round(token_pressure, 4),
            "recommended_actions": actions,
            "guardian_alerts": guardian_alerts,
            "resource_governor": governor,
        }


__all__ = ["OmegaUpgradeV7Orchestrator"]
