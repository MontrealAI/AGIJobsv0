"""Omega-grade orchestrator coordinating agents, jobs, and resources."""

from __future__ import annotations

import asyncio
import json
import logging
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set, Tuple

from .agents import AgentContext, StrategistAgent, ValidatorAgent, WorkerAgent, spawn_agent
from .audit import AuditTrail
from .checkpoint import CheckpointManager
from .governance import GovernanceController, GovernanceParameters
from .jobs import JobRecord, JobRegistry, JobSpec, JobStatus
from .logging_config import configure_logging
from .messaging import MessageBus
from .resources import ResourceManager
from .scheduler import EventScheduler, ScheduledEvent
from .simulation import PlanetarySimulation, SimulationState, SyntheticEconomySim


@dataclass
class OrchestratorConfig:
    mission_name: str = "Kardashev-II Omega-Grade α-AGI Business 3"
    checkpoint_path: Path = Path("checkpoint.json")
    checkpoint_interval_seconds: int = 60
    resume_from_checkpoint: bool = True
    enable_simulation: bool = True
    simulation_tick_seconds: float = 1.0
    simulation_hours_per_tick: float = 1.0
    simulation_energy_scale: float = 2.0
    simulation_compute_scale: float = 1.0
    operator_account: str = "operator"
    base_agent_tokens: float = 10_000.0
    energy_capacity: float = 1_000_000.0
    compute_capacity: float = 5_000_000.0
    governance: GovernanceParameters = field(default_factory=GovernanceParameters)
    validator_names: List[str] = field(default_factory=lambda: ["validator-1", "validator-2", "validator-3"])
    worker_specs: Dict[str, float] = field(
        default_factory=lambda: {
            "energy-architect": 1.5,
            "supply-chain": 1.2,
            "validator-ops": 1.0,
        }
    )
    strategist_names: List[str] = field(default_factory=lambda: ["macro-strategist"])
    cycle_sleep_seconds: float = 0.2
    max_cycles: Optional[int] = None
    insight_interval_seconds: int = 30
    control_channel_file: Path = Path("control-channel.jsonl")
    audit_log_path: Optional[Path] = None
    initial_jobs: List[Dict[str, Any]] = field(default_factory=list)
    status_output_path: Optional[Path] = None
    heartbeat_interval_seconds: float = 5.0
    heartbeat_timeout_seconds: float = 30.0
    health_check_interval_seconds: float = 5.0


class Orchestrator:
    """Coordinates agents, jobs, validators, resources, and simulation."""

    def __init__(self, config: OrchestratorConfig) -> None:
        configure_logging()
        self.log = logging.getLogger("omega.orchestrator")
        self.config = config
        self.bus = MessageBus()
        self.audit: Optional[AuditTrail] = None
        if config.audit_log_path:
            self.audit = AuditTrail(config.audit_log_path)
            self.bus.register_listener(self.audit.record_message)
        self.resources = ResourceManager(
            energy_capacity=config.energy_capacity,
            compute_capacity=config.compute_capacity,
            base_token_supply=config.base_agent_tokens * 10,
        )
        self.job_registry = JobRegistry()
        self.scheduler = EventScheduler(self._dispatch_scheduled_event)
        self.checkpoint = CheckpointManager(config.checkpoint_path)
        self.governance = GovernanceController(config.governance)
        self.simulation: Optional[PlanetarySimulation] = SyntheticEconomySim() if config.enable_simulation else None
        self._latest_simulation_state: Optional[SimulationState] = None
        self._tasks: List[asyncio.Task] = []
        self._running = False
        self._paused = asyncio.Event()
        self._paused.set()
        self._cycle = 0
        self._stopped = asyncio.Event()
        self._status_path = config.status_output_path
        self._status_lock = asyncio.Lock()
        if self._status_path is not None:
            self._status_path.parent.mkdir(parents=True, exist_ok=True)
            if not self._status_path.exists():
                self._status_path.touch()
        self._event_handlers: Dict[str, Callable[[ScheduledEvent], Awaitable[None]]] = {
            "job_deadline": self._handle_job_deadline_event,
            "validation_commit_end": self._handle_validation_commit_end_event,
            "validation_finalize": self._handle_validation_finalize_event,
        }
        self._agent_last_seen: Dict[str, datetime] = {}
        self._agent_roles: Dict[str, str] = {}
        self._agent_skills: Dict[str, List[str]] = {}
        self._unresponsive_agents: Set[str] = set()
        self._agent_lock = Lock()

    def _log(self, level: int, event: str, **fields: object) -> None:
        self.log.log(level, event, extra={"event": event, **fields})

    def _info(self, event: str, **fields: object) -> None:
        self._log(logging.INFO, event, **fields)

    def _warning(self, event: str, **fields: object) -> None:
        self._log(logging.WARNING, event, **fields)

    def _error(self, event: str, **fields: object) -> None:
        self._log(logging.ERROR, event, **fields)

    async def start(self) -> None:
        self._info("orchestrator_start", mission=self.config.mission_name)
        await self._bootstrap_state()
        self._running = True
        self._stopped.clear()
        self._tasks.clear()
        self._tasks.extend(await self._spawn_agents())
        self._tasks.append(asyncio.create_task(self._checkpoint_loop(), name="checkpoint"))
        self._tasks.append(asyncio.create_task(self._insight_loop(), name="insights"))
        self._tasks.append(asyncio.create_task(self._result_listener(), name="results"))
        self._tasks.append(asyncio.create_task(self._control_listener(), name="control"))
        self._tasks.append(asyncio.create_task(self._control_file_listener(), name="control-file"))
        self._tasks.append(asyncio.create_task(self._heartbeat_listener(), name="heartbeat-listener"))
        self._tasks.append(asyncio.create_task(self._agent_health_loop(), name="agent-health"))
        if self.simulation:
            self._tasks.append(asyncio.create_task(self._simulation_loop(), name="simulation"))
        await self._seed_jobs()
        self._tasks.append(asyncio.create_task(self._cycle_loop(), name="cycles"))

    async def _bootstrap_state(self) -> None:
        self.resources.ensure_account(self.config.operator_account, self.config.base_agent_tokens * 10)
        self._control_path = self.config.control_channel_file
        self._control_path.parent.mkdir(parents=True, exist_ok=True)
        self._control_path.touch(exist_ok=True)
        for worker in self.config.worker_specs:
            self.resources.ensure_account(worker, self.config.base_agent_tokens)
        for validator in self.config.validator_names:
            self.resources.ensure_account(validator, self.config.base_agent_tokens / 2)
        for strategist in self.config.strategist_names:
            self.resources.ensure_account(strategist, self.config.base_agent_tokens)
        if self.config.resume_from_checkpoint:
            snapshot = self.checkpoint.load()
            if snapshot:
                job_records = self._rehydrate_jobs(snapshot.get("jobs", {}))
                if job_records:
                    self.job_registry.rehydrate(job_records)
                    scheduler_state = snapshot.get("scheduler", {})
                    if isinstance(scheduler_state, dict):
                        await self.scheduler.rehydrate(scheduler_state)
                    for record in self.job_registry.iter_jobs():
                        await self._ensure_job_events(record)
                self._info("state_rehydrated", job_count=len(job_records))
                for agent, balances in snapshot.get("resources", {}).items():
                    account = self.resources.ensure_account(agent)
                    account.tokens = balances["tokens"]
                    account.locked = balances["locked"]
                    account.energy_quota = balances["energy_quota"]
                    account.compute_quota = balances["compute_quota"]

    async def _ensure_job_events(self, job: JobRecord) -> None:
        if job.status in {JobStatus.CANCELLED, JobStatus.FAILED, JobStatus.FINALIZED}:
            await self._cancel_job_events(job)
            return
        if job.status in {JobStatus.POSTED, JobStatus.IN_PROGRESS}:
            if not self.scheduler.has_event(job.deadline_event_id):
                deadline = await self.scheduler.schedule(
                    "job_deadline",
                    job.spec.deadline,
                    {"job_id": job.job_id},
                    event_id=job.deadline_event_id,
                )
                job.deadline_event_id = deadline.event_id
        if job.status == JobStatus.COMPLETED:
            if job.commit_deadline and not self.scheduler.has_event(job.commit_event_id):
                commit = await self.scheduler.schedule(
                    "validation_commit_end",
                    job.commit_deadline,
                    {"job_id": job.job_id},
                    event_id=job.commit_event_id,
                )
                job.commit_event_id = commit.event_id
            if job.reveal_deadline and not self.scheduler.has_event(job.finalization_event_id):
                finalize = await self.scheduler.schedule(
                    "validation_finalize",
                    job.reveal_deadline,
                    {"job_id": job.job_id},
                    event_id=job.finalization_event_id,
                )
                job.finalization_event_id = finalize.event_id

    async def _spawn_agents(self) -> List[asyncio.Task[None]]:
        tasks: List[asyncio.Task[None]] = []
        for name, efficiency in self.config.worker_specs.items():
            context = AgentContext(name=name, skills={name}, bus=self.bus, resources=self.resources)
            self._register_agent(name, "worker", list(context.skills))
            agent = WorkerAgent(
                context,
                efficiency=efficiency,
                post_job=self.post_alpha_job,
                heartbeat_interval=self.config.heartbeat_interval_seconds,
            )
            task = await spawn_agent(f"worker:{name}", agent)
            self._monitor_task(f"worker:{name}", task)
            tasks.append(task)
        for name in self.config.strategist_names:
            context = AgentContext(name=name, skills={"strategy"}, bus=self.bus, resources=self.resources)
            agent = StrategistAgent(
                context,
                post_job=self.post_alpha_job,
                delegation_skills=list(self.config.worker_specs.keys()),
                heartbeat_interval=self.config.heartbeat_interval_seconds,
            )
            self._register_agent(name, "strategist", list(context.skills))
            task = await spawn_agent(f"strategist:{name}", agent)
            self._monitor_task(f"strategist:{name}", task)
            tasks.append(task)
        for name in self.config.validator_names:
            context = AgentContext(name=name, skills={"validation"}, bus=self.bus, resources=self.resources)
            agent = ValidatorAgent(
                context,
                self.governance,
                heartbeat_interval=self.config.heartbeat_interval_seconds,
            )
            self._register_agent(name, "validator", list(context.skills))
            task = await spawn_agent(f"validator:{name}", agent)
            self._monitor_task(f"validator:{name}", task)
            tasks.append(task)
        return tasks

    def _register_agent(self, name: str, role: str, skills: List[str]) -> None:
        now = datetime.now(timezone.utc)
        with self._agent_lock:
            self._agent_roles[name] = role
            self._agent_skills[name] = list(skills)
            self._agent_last_seen.setdefault(name, now)
            self._unresponsive_agents.discard(name)

    def _monitor_task(self, label: str, task: asyncio.Task[None]) -> None:
        def _done_callback(completed: asyncio.Task[None]) -> None:
            if completed.cancelled():
                return
            exc = completed.exception()
            if exc is not None:
                self._error("background_task_crashed", task=label, error=str(exc))

        task.add_done_callback(_done_callback)

    async def _cycle_loop(self) -> None:
        while self._running:
            await self._paused.wait()
            self._cycle += 1
            if self.config.max_cycles and self._cycle > self.config.max_cycles:
                self._info("cycle_limit_reached", cycle=self._cycle)
                asyncio.create_task(self.shutdown(), name="shutdown-from-cycle")
                break
            await asyncio.sleep(self.config.cycle_sleep_seconds)

    async def _insight_loop(self) -> None:
        while self._running:
            await self._paused.wait()
            await self.bus.publish(
                "insights",
                {"idea": f"Dyson-swarm expansion cycle {self._cycle}"},
                "orchestrator",
            )
            await self._persist_status_snapshot()
            await asyncio.sleep(self.config.insight_interval_seconds)

    async def _simulation_loop(self) -> None:
        assert self.simulation is not None
        while self._running:
            await self._paused.wait()
            hours = max(0.0, float(self.config.simulation_hours_per_tick)) or 1.0
            state = self.simulation.tick(hours=hours)
            self._latest_simulation_state = state
            prev_energy_capacity = self.resources.energy_capacity
            prev_energy_available = self.resources.energy_available
            prev_compute_capacity = self.resources.compute_capacity
            prev_compute_available = self.resources.compute_available
            energy_capacity_target = max(
                self.resources.energy_capacity,
                self.config.energy_capacity,
                state.energy_output_gw * self.config.simulation_energy_scale,
            )
            prosperity_factor = 1.0 + state.prosperity_index * self.config.simulation_compute_scale
            sustainability_factor = 1.0 + state.sustainability_index * 0.5 * self.config.simulation_compute_scale
            compute_capacity_target = max(
                self.resources.compute_capacity,
                self.config.compute_capacity,
                self.config.compute_capacity * prosperity_factor * sustainability_factor,
            )
            energy_usage = max(0.0, prev_energy_capacity - prev_energy_available)
            compute_usage = max(0.0, prev_compute_capacity - prev_compute_available)
            energy_available_target = max(0.0, energy_capacity_target - energy_usage)
            compute_available_target = max(0.0, compute_capacity_target - compute_usage)
            self.resources.update_capacity(
                energy_capacity=energy_capacity_target,
                energy_available=energy_available_target,
                compute_capacity=compute_capacity_target,
                compute_available=compute_available_target,
            )
            self._info(
                "simulation_tick",
                energy_output=state.energy_output_gw,
                prosperity=state.prosperity_index,
                sustainability=state.sustainability_index,
                energy_available=self.resources.energy_available,
                compute_available=self.resources.compute_available,
                energy_price=self.resources.energy_price,
                compute_price=self.resources.compute_price,
            )
            await asyncio.sleep(max(0.01, float(self.config.simulation_tick_seconds)))

    async def _seed_jobs(self) -> None:
        if any(self.job_registry.iter_jobs()):
            return
        if self.config.initial_jobs:
            for raw_spec in self.config.initial_jobs:
                try:
                    spec = JobSpec.from_dict(raw_spec)
                except Exception as exc:
                    self._error("initial_job_invalid", error=str(exc), payload=raw_spec)
                    continue
                await self.post_alpha_job(spec)
            return
        root_spec = JobSpec(
            title="Planetary Dyson Swarm Expansion",
            description="Coordinate planetary-scale infrastructure deployment leveraging recursive AGI labour markets.",
            required_skills=[next(iter(self.config.worker_specs))],
            reward_tokens=5_000.0,
            deadline=datetime.now(timezone.utc) + timedelta(hours=12),
            validation_window=timedelta(hours=1),
            energy_budget=50_000.0,
            compute_budget=100_000.0,
            metadata={"employer": self.config.operator_account},
        )
        await self.post_alpha_job(root_spec)
        await self._persist_status_snapshot()

    async def _checkpoint_loop(self) -> None:
        while self._running:
            await self._paused.wait()
            await asyncio.sleep(self.config.checkpoint_interval_seconds)
            self.checkpoint.save(
                {record.job_id: record for record in self.job_registry.iter_jobs()},
                self.resources,
                scheduler=self.scheduler,
            )
            snapshot = self.resources.snapshot()
            self._info(
                "checkpoint_saved",
                jobs=len(list(self.job_registry.iter_jobs())),
                energy_available=snapshot.energy_available,
                compute_available=snapshot.compute_available,
                token_supply=snapshot.token_supply,
                locked_supply=snapshot.locked_supply,
            )
            await self._persist_status_snapshot()

    def _rehydrate_jobs(self, serialized: Dict[str, Any]) -> List[JobRecord]:
        records: List[JobRecord] = []
        for job_id, payload in serialized.items():
            spec_payload = payload.get("spec", {})
            validation_window = timedelta(seconds=float(spec_payload.get("validation_window_seconds", 0.0)))
            deadline_raw = spec_payload.get("deadline")
            deadline = (
                datetime.fromisoformat(deadline_raw)
                if isinstance(deadline_raw, str)
                else datetime.now(timezone.utc)
            )
            spec = JobSpec(
                title=spec_payload.get("title", ""),
                description=spec_payload.get("description", ""),
                required_skills=list(spec_payload.get("required_skills", [])),
                reward_tokens=float(spec_payload.get("reward_tokens", 0.0)),
                deadline=deadline,
                validation_window=validation_window,
                parent_id=spec_payload.get("parent_id"),
                stake_required=float(spec_payload.get("stake_required", 0.0)),
                energy_budget=float(spec_payload.get("energy_budget", 0.0)),
                compute_budget=float(spec_payload.get("compute_budget", 0.0)),
                metadata=dict(spec_payload.get("metadata", {})),
            )
            created_at_raw = payload.get("created_at")
            created_at = (
                datetime.fromisoformat(created_at_raw)
                if isinstance(created_at_raw, str)
                else datetime.now(timezone.utc)
            )
            status = JobStatus(payload.get("status", JobStatus.POSTED.value))
            validator_votes = {
                validator: bool(vote) for validator, vote in payload.get("validator_votes", {}).items()
            }
            record = JobRecord(
                job_id=job_id,
                spec=spec,
                status=status,
                created_at=created_at,
                assigned_agent=payload.get("assigned_agent"),
                energy_used=float(payload.get("energy_used", 0.0)),
                compute_used=float(payload.get("compute_used", 0.0)),
                stake_locked=float(payload.get("stake_locked", 0.0)),
                result_summary=payload.get("result_summary"),
                validator_commits=dict(payload.get("validator_commits", {})),
                validator_votes=validator_votes,
                validators_with_stake=set(payload.get("validators_with_stake", [])),
            )
            record.deadline_event_id = payload.get("deadline_event_id")
            record.commit_event_id = payload.get("commit_event_id")
            record.finalization_event_id = payload.get("finalization_event_id")
            commit_deadline_raw = payload.get("commit_deadline")
            if isinstance(commit_deadline_raw, str):
                commit_deadline = datetime.fromisoformat(commit_deadline_raw)
                if commit_deadline.tzinfo is None:
                    commit_deadline = commit_deadline.replace(tzinfo=timezone.utc)
                record.commit_deadline = commit_deadline
            reveal_deadline_raw = payload.get("reveal_deadline")
            if isinstance(reveal_deadline_raw, str):
                reveal_deadline = datetime.fromisoformat(reveal_deadline_raw)
                if reveal_deadline.tzinfo is None:
                    reveal_deadline = reveal_deadline.replace(tzinfo=timezone.utc)
                record.reveal_deadline = reveal_deadline
            records.append(record)
        return records

    async def _result_listener(self) -> None:
        async with self.bus.subscribe("*") as receiver:
            while self._running:
                message = await receiver()
                if message.topic == "jobs:claim":
                    try:
                        await self.assign_job(message.payload["job_id"], message.payload["agent"])
                    except ValueError:
                        self._warning(
                            "job_claim_race",
                            job_id=message.payload.get("job_id"),
                            agent=message.payload.get("agent"),
                        )
                elif message.topic.startswith("results:"):
                    await self._handle_job_result(message.payload)
                elif message.topic.startswith("validation:commit:"):
                    job_id = message.topic.split(":")[-1]
                    job = self.job_registry.get_job(job_id)
                    job.validator_commits[message.payload["validator"]] = message.payload["commit"]
                elif message.topic.startswith("validation:reveal:"):
                    job_id = message.topic.split(":")[-1]
                    await self._handle_reveal(job_id, message.payload["validator"], message.payload["vote"])

    async def _dispatch_scheduled_event(self, event: ScheduledEvent) -> None:
        handler = self._event_handlers.get(event.event_type)
        if handler is None:
            self._warning("scheduler_unknown_event", event_type=event.event_type, payload=event.payload)
            return
        await handler(event)

    async def _control_file_listener(self) -> None:
        try:
            with self._control_path.open("r", encoding="utf-8") as handle:
                handle.seek(0, 2)
                while self._running:
                    position = handle.tell()
                    line = handle.readline()
                    if not line:
                        await asyncio.sleep(1)
                        handle.seek(position)
                        continue
                    try:
                        payload = json.loads(line)
                    except json.JSONDecodeError:
                        self._warning("control_decode_error", line=line.strip())
                        continue
                    await self.bus.broadcast_control(payload, "operator-file")
        except FileNotFoundError:
            self._error("control_file_missing", path=str(self._control_path))

    async def _control_listener(self) -> None:
        async with self.bus.subscribe("control") as receiver:
            while self._running:
                message = await receiver()
                action = message.payload.get("action")
                if action == "pause" and self.governance.params.pause_enabled:
                    self.pause()
                elif action == "resume":
                    self.resume()
                elif action == "stop":
                    await self.shutdown()
                elif action == "update_parameters":
                    self._handle_parameter_update(message.payload)
                elif action == "set_account":
                    self._handle_account_adjustment(message.payload)
                elif action == "cancel_job":
                    await self._handle_cancel_job(message.payload)

    async def _heartbeat_listener(self) -> None:
        async with self.bus.subscribe("heartbeat") as receiver:
            while self._running:
                message = await receiver()
                payload = message.payload
                agent_name = str(payload.get("agent") or message.publisher)
                role = str(payload.get("role") or self._agent_roles.get(agent_name, "agent"))
                skills_raw = payload.get("skills")
                timestamp = datetime.now(timezone.utc)
                recovered = False
                with self._agent_lock:
                    if isinstance(skills_raw, list):
                        self._agent_skills[agent_name] = [str(skill) for skill in skills_raw]
                    self._agent_roles.setdefault(agent_name, role)
                    self._agent_last_seen[agent_name] = timestamp
                    if agent_name in self._unresponsive_agents:
                        self._unresponsive_agents.remove(agent_name)
                        recovered = True
                if recovered:
                    self._info("agent_recovered", agent=agent_name, role=role)
                    await self._persist_status_snapshot()

    def _detect_unresponsive_agents(
        self,
        now: Optional[datetime] = None,
        *,
        threshold_seconds: Optional[float] = None,
    ) -> List[Tuple[str, float]]:
        current_time = now or datetime.now(timezone.utc)
        threshold = threshold_seconds if threshold_seconds is not None else max(
            0.2, float(self.config.heartbeat_timeout_seconds)
        )
        newly_unresponsive: List[Tuple[str, float]] = []
        with self._agent_lock:
            for agent, last_seen in list(self._agent_last_seen.items()):
                delta = (current_time - last_seen).total_seconds()
                if delta > threshold and agent not in self._unresponsive_agents:
                    self._unresponsive_agents.add(agent)
                    newly_unresponsive.append((agent, delta))
        return newly_unresponsive

    async def _agent_health_loop(self) -> None:
        threshold_seconds = max(0.2, float(self.config.heartbeat_timeout_seconds))
        threshold = timedelta(seconds=threshold_seconds)
        interval = max(0.1, float(self.config.health_check_interval_seconds))
        while self._running:
            await self._paused.wait()
            now = datetime.now(timezone.utc)
            newly_unresponsive = self._detect_unresponsive_agents(
                now, threshold_seconds=threshold_seconds
            )
            for agent, delta in newly_unresponsive:
                self._warning(
                    "agent_unresponsive",
                    agent=agent,
                    seconds_since_heartbeat=round(delta, 2),
                )
            if newly_unresponsive:
                await self._persist_status_snapshot()
            await asyncio.sleep(interval)

    async def _handle_job_result(self, payload: Dict[str, str]) -> None:
        summary = payload["summary"]
        job_id = payload["job_id"]
        energy_used = float(payload.get("energy_used", 0.0))
        compute_used = float(payload.get("compute_used", 0.0))
        record = self.job_registry.get_job(job_id)
        if record.status != JobStatus.IN_PROGRESS:
            self._warning("unexpected_result_state", job_id=job_id, status=record.status.value)
            return
        if record.assigned_agent:
            try:
                self.resources.record_usage(record.assigned_agent, energy_used, compute_used)
            except ValueError as exc:
                self._warning("resource_overuse", job_id=job_id, error=str(exc))
        await self._cancel_job_events(record)
        record = self.job_registry.mark_completed(job_id, summary, energy_used, compute_used)
        await self._initiate_validation(record)
        await self._persist_status_snapshot()

    async def _handle_reveal(self, job_id: str, validator: str, vote: bool) -> None:
        job = self.job_registry.get_job(job_id)
        job.validator_votes[validator] = vote
        approvals = sum(1 for v in job.validator_votes.values() if v)
        if self.governance.require_quorum(approvals):
            await self._finalize_job(job)
        else:
            await self._persist_status_snapshot()

    async def _cancel_job_events(
        self,
        job: JobRecord,
        *,
        include_deadline: bool = True,
        skip_event_id: Optional[str] = None,
    ) -> None:
        if include_deadline:
            deadline_id = job.deadline_event_id
            if deadline_id and deadline_id != skip_event_id:
                await self.scheduler.cancel(deadline_id)
            job.deadline_event_id = None
        commit_id = job.commit_event_id
        finalize_id = job.finalization_event_id
        clear_validation = False
        if commit_id:
            if commit_id != skip_event_id:
                await self.scheduler.cancel(commit_id)
            job.commit_event_id = None
            clear_validation = True
        if finalize_id:
            if finalize_id != skip_event_id:
                await self.scheduler.cancel(finalize_id)
            job.finalization_event_id = None
            clear_validation = True
        if skip_event_id in {commit_id, finalize_id}:
            clear_validation = True
        if clear_validation:
            job.commit_deadline = None
            job.reveal_deadline = None

    async def _handle_job_deadline_event(self, event: ScheduledEvent) -> None:
        job_id = str(event.payload.get("job_id", ""))
        if not job_id:
            return
        try:
            job = self.job_registry.get_job(job_id)
        except KeyError:
            return
        job.deadline_event_id = None
        if job.status in {JobStatus.CANCELLED, JobStatus.FAILED, JobStatus.FINALIZED}:
            return
        if job.status in {JobStatus.POSTED, JobStatus.IN_PROGRESS}:
            job = self.job_registry.mark_failed(job.job_id, "Deadline reached")
            self._warning("job_deadline_missed", job_id=job.job_id)
            if job.assigned_agent:
                slash_amount = self.governance.slash_amount(job.stake_locked)
                self.resources.slash(job.assigned_agent, slash_amount)
            await self.bus.publish(
                f"jobs:recovery:{job.job_id}",
                {"job_id": job.job_id, "status": job.status.value},
                "orchestrator",
            )
            await self._cancel_job_events(job, include_deadline=False, skip_event_id=event.event_id)
            await self._persist_status_snapshot()

    async def _handle_validation_commit_end_event(self, event: ScheduledEvent) -> None:
        job_id = str(event.payload.get("job_id", ""))
        if not job_id:
            return
        try:
            job = self.job_registry.get_job(job_id)
        except KeyError:
            return
        job.commit_event_id = None
        await self.bus.publish(
            f"validation:phase:reveal:{job_id}",
            {"job_id": job_id, "stage": "reveal"},
            "orchestrator",
        )
        await self._persist_status_snapshot()

    async def _handle_validation_finalize_event(self, event: ScheduledEvent) -> None:
        job_id = str(event.payload.get("job_id", ""))
        if not job_id:
            return
        try:
            job = self.job_registry.get_job(job_id)
        except KeyError:
            return
        await self._finalize_job(job, skip_event_id=event.event_id)

    async def post_alpha_job(self, spec: JobSpec) -> JobRecord:
        employer = spec.metadata.get("employer", self.config.operator_account)
        employer_account = self.resources.ensure_account(employer, self.config.base_agent_tokens)
        stake_required = spec.reward_tokens * self.governance.params.worker_stake_ratio
        if employer_account.tokens < spec.reward_tokens + stake_required:
            raise ValueError("Employer lacks budget for job")
        self.resources.debit_tokens(employer, spec.reward_tokens)
        spec.stake_required = stake_required
        record = self.job_registry.create_job(spec)
        self._info("job_posted", job_id=record.job_id, title=spec.title, reward=spec.reward_tokens)
        deadline_event = await self.scheduler.schedule(
            "job_deadline",
            spec.deadline,
            {"job_id": record.job_id},
            event_id=record.deadline_event_id,
        )
        record.deadline_event_id = deadline_event.event_id
        await self.bus.publish(
            topic=f"jobs:{spec.required_skills[0] if spec.required_skills else 'general'}",
            payload={"spec": spec, "job_id": record.job_id},
            publisher="orchestrator",
        )
        await self._persist_status_snapshot()
        return record

    async def assign_job(self, job_id: str, agent_name: str) -> JobRecord:
        job = self.job_registry.get_job(job_id)
        if job.status != JobStatus.POSTED:
            raise ValueError("Job already assigned")
        stake = job.spec.reward_tokens * self.governance.params.worker_stake_ratio
        self.resources.lock_stake(agent_name, stake)
        job = self.job_registry.mark_in_progress(job_id, agent_name, stake)
        await self.bus.publish(
            f"jobs:assignment:{job_id}",
            {"job_id": job_id, "agent": agent_name},
            "orchestrator",
        )
        await self._persist_status_snapshot()
        return job

    async def _initiate_validation(self, job: JobRecord) -> None:
        for validator in self.config.validator_names:
            self.resources.lock_stake(validator, self.governance.params.validator_stake)
            job.validators_with_stake.add(validator)
            await self.bus.publish(
                f"validation:request:{job.job_id}",
                {"validator": validator, "job_id": job.job_id},
                "orchestrator",
            )
        now = datetime.now(timezone.utc)
        commit_deadline = now + self.governance.params.validator_commit_window
        reveal_deadline = commit_deadline + self.governance.params.validator_reveal_window
        job.commit_deadline = commit_deadline
        job.reveal_deadline = reveal_deadline
        commit_event = await self.scheduler.schedule(
            "validation_commit_end",
            commit_deadline,
            {"job_id": job.job_id},
            event_id=job.commit_event_id,
        )
        finalize_event = await self.scheduler.schedule(
            "validation_finalize",
            reveal_deadline,
            {"job_id": job.job_id},
            event_id=job.finalization_event_id,
        )
        job.commit_event_id = commit_event.event_id
        job.finalization_event_id = finalize_event.event_id

    async def _finalize_job(self, job: JobRecord, *, skip_event_id: Optional[str] = None) -> None:
        if job.status == JobStatus.FINALIZED:
            return
        approvals = sum(1 for v in job.validator_votes.values() if v)
        if not self.governance.require_quorum(approvals):
            self._warning("validation_quorum_not_met", job_id=job.job_id)
            job = self.job_registry.mark_failed(job.job_id, "Validation quorum not met")
            if job.assigned_agent:
                slash_amount = self.governance.slash_amount(job.stake_locked)
                self.resources.slash(job.assigned_agent, slash_amount)
        else:
            job = self.job_registry.finalize_job(job.job_id)
            if job.assigned_agent:
                self.resources.credit_tokens(job.assigned_agent, job.spec.reward_tokens)
                self.resources.release_stake(job.assigned_agent, job.stake_locked)
        await self._cancel_job_events(job, skip_event_id=skip_event_id)
        self._release_validator_stake(job)
        self._info("job_finalized", job_id=job.job_id, status=job.status.value)
        await self._persist_status_snapshot()

    def _release_validator_stake(self, job: JobRecord) -> None:
        if not job.validators_with_stake:
            return
        for validator in list(job.validators_with_stake):
            self.resources.release_stake(validator, self.governance.params.validator_stake)
        job.validators_with_stake.clear()

    def pause(self) -> None:
        self._paused.clear()
        self._info("orchestrator_paused")

    def resume(self) -> None:
        self._paused.set()
        self._info("orchestrator_resumed")

    async def shutdown(self) -> None:
        if not self._running and self._stopped.is_set():
            return
        self._running = False
        self._paused.set()
        current = asyncio.current_task()
        pending: List[asyncio.Task] = []
        for task in list(self._tasks):
            if task is current or task.done():
                continue
            task.cancel()
            pending.append(task)
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        self._tasks = [task for task in self._tasks if not task.cancelled() and not task.done()]
        await self.scheduler.shutdown()
        self.checkpoint.save(
            {record.job_id: record for record in self.job_registry.iter_jobs()},
            self.resources,
            scheduler=self.scheduler,
        )
        self._info("orchestrator_stopped")
        if self.audit:
            await self.audit.close()
        await self._persist_status_snapshot()
        self._stopped.set()

    async def wait_until_stopped(self) -> None:
        await self._stopped.wait()

    def _handle_parameter_update(self, payload: Dict[str, Any]) -> None:
        updates = payload.get("governance")
        if isinstance(updates, dict):
            gov_updates: Dict[str, Any] = {}
            for key in ("worker_stake_ratio", "validator_stake", "approvals_required", "slash_ratio"):
                if key in updates:
                    gov_updates[key] = float(updates[key]) if key != "approvals_required" else int(updates[key])
            for key in ("validator_commit_window", "validator_reveal_window"):
                if key in updates:
                    gov_updates[key] = timedelta(seconds=float(updates[key]))
            if "pause_enabled" in updates:
                gov_updates["pause_enabled"] = bool(updates["pause_enabled"])
            if gov_updates:
                self.governance.update(**gov_updates)
                self._info("governance_parameters_updated", fields=list(gov_updates.keys()))
        resource_updates = payload.get("resources")
        if isinstance(resource_updates, dict):
            capacity_kwargs: Dict[str, float] = {}
            for key in ("energy_capacity", "compute_capacity", "energy_available", "compute_available"):
                if key in resource_updates:
                    capacity_kwargs[key] = float(resource_updates[key])
            if capacity_kwargs:
                self.resources.update_capacity(**capacity_kwargs)
            accounts = resource_updates.get("accounts")
            adjusted_accounts = 0
            if isinstance(accounts, list):
                for account_spec in accounts:
                    if not isinstance(account_spec, dict):
                        continue
                    name = account_spec.get("name")
                    if not isinstance(name, str) or not name:
                        continue
                    adjust_kwargs: Dict[str, float] = {}
                    for field in ("tokens", "locked", "energy_quota", "compute_quota"):
                        if field in account_spec:
                            adjust_kwargs[field] = float(account_spec[field])
                    self.resources.adjust_account(name, **adjust_kwargs)
                    adjusted_accounts += 1
            if capacity_kwargs or adjusted_accounts:
                self._info(
                    "resource_parameters_updated",
                    capacity_fields=list(capacity_kwargs.keys()),
                    accounts=adjusted_accounts,
                )
        config_updates = payload.get("config")
        if isinstance(config_updates, dict):
            updated_fields: List[str] = []
            for field in (
                "insight_interval_seconds",
                "cycle_sleep_seconds",
                "checkpoint_interval_seconds",
                "max_cycles",
                "simulation_tick_seconds",
                "simulation_hours_per_tick",
                "simulation_energy_scale",
                "simulation_compute_scale",
            ):
                if field in config_updates:
                    value = config_updates[field]
                    if field == "max_cycles":
                        numeric_value: Optional[int] = None
                        try:
                            if value is not None:
                                numeric_value = int(value)
                        except (TypeError, ValueError):
                            numeric_value = None
                        setattr(self.config, field, None if not numeric_value or numeric_value <= 0 else numeric_value)
                    elif field in {"simulation_tick_seconds", "simulation_hours_per_tick", "simulation_energy_scale", "simulation_compute_scale"}:
                        numeric = float(value)
                        setattr(self.config, field, max(0.0, numeric))
                    else:
                        numeric = float(value)
                        setattr(self.config, field, numeric)
                    updated_fields.append(field)
            if updated_fields:
                self._info("config_parameters_updated", fields=updated_fields)

    def _handle_account_adjustment(self, payload: Dict[str, Any]) -> None:
        name = payload.get("account")
        if not isinstance(name, str) or not name:
            self._warning("account_update_missing_name")
            return
        adjust_kwargs: Dict[str, float] = {}
        for field in ("tokens", "locked", "energy_quota", "compute_quota"):
            if field in payload:
                adjust_kwargs[field] = float(payload[field])
        account = self.resources.adjust_account(name, **adjust_kwargs)
        self._info(
            "account_adjusted",
            account=name,
            tokens=account.tokens,
            locked=account.locked,
            energy_quota=account.energy_quota,
            compute_quota=account.compute_quota,
        )

    async def _handle_cancel_job(self, payload: Dict[str, Any]) -> None:
        job_id = payload.get("job_id")
        if not isinstance(job_id, str) or not job_id:
            self._warning("cancel_missing_job_id")
            return
        reason = payload.get("reason", "Operator cancelled job")
        try:
            job = self.job_registry.get_job(job_id)
        except KeyError:
            self._warning("cancel_unknown_job", job_id=job_id)
            return
        if job.status == JobStatus.FINALIZED:
            self._warning("cancel_ignored_finalized", job_id=job_id)
            return
        if job.status == JobStatus.CANCELLED:
            self._info("cancel_noop", job_id=job_id)
            return
        employer = str(job.spec.metadata.get("employer", self.config.operator_account))
        self.resources.credit_tokens(employer, job.spec.reward_tokens)
        if job.assigned_agent:
            self.resources.release_stake(job.assigned_agent, job.stake_locked)
        self._release_validator_stake(job)
        await self._cancel_job_events(job)
        job = self.job_registry.mark_cancelled(job_id, str(reason))
        await self.bus.publish(
            f"jobs:cancelled:{job_id}",
            {"job_id": job_id, "reason": reason},
            "orchestrator",
        )
        self._info("job_cancelled", job_id=job_id, reason=reason)
        await self._persist_status_snapshot()

    def _capture_agent_snapshot(self) -> Dict[str, Any]:
        with self._agent_lock:
            roles = dict(self._agent_roles)
            last_seen = {
                agent: ts.isoformat()
                for agent, ts in self._agent_last_seen.items()
            }
            skills = {agent: list(self._agent_skills.get(agent, [])) for agent in roles}
            health = {
                agent: ("unresponsive" if agent in self._unresponsive_agents else "healthy")
                for agent in roles
            }
            unresponsive = sorted(self._unresponsive_agents)
        return {
            "roles": roles,
            "skills": skills,
            "last_seen": last_seen,
            "health": health,
            "unresponsive": unresponsive,
            "heartbeat_interval_seconds": self.config.heartbeat_interval_seconds,
            "heartbeat_timeout_seconds": self.config.heartbeat_timeout_seconds,
        }

    def _collect_status_snapshot(self) -> Dict[str, Any]:
        jobs = list(self.job_registry.iter_jobs())
        status_counts = Counter(job.status.value for job in jobs)
        active_jobs = [
            job.job_id
            for job in jobs
            if job.status in {JobStatus.POSTED, JobStatus.IN_PROGRESS}
        ]
        root_jobs = [job.job_id for job in jobs if job.spec.parent_id is None]
        resource_state = self.resources.snapshot()
        accounts = self.resources.to_serializable()
        governance = self.governance.params
        simulation_state: Optional[Dict[str, float]] = None
        if self._latest_simulation_state is not None:
            simulation_state = {
                "energy_output_gw": self._latest_simulation_state.energy_output_gw,
                "prosperity_index": self._latest_simulation_state.prosperity_index,
                "sustainability_index": self._latest_simulation_state.sustainability_index,
            }
        pending_events = list(self.scheduler.pending_events())
        pending_counts = Counter(event.event_type for event in pending_events)
        next_event = self.scheduler.peek_next()
        next_event_payload: Optional[Dict[str, Any]] = None
        if next_event is not None:
            next_event_payload = {
                "type": next_event.event_type,
                "execute_at": next_event.execute_at.isoformat(),
                "job_id": next_event.payload.get("job_id"),
                "eta_seconds": max(
                    0.0,
                    (next_event.execute_at - datetime.now(timezone.utc)).total_seconds(),
                ),
            }
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "mission": self.config.mission_name,
            "cycle": self._cycle,
            "running": self._running,
            "paused": not self._paused.is_set(),
            "jobs": {
                "total": len(jobs),
                "status_counts": dict(status_counts),
                "active_job_ids": active_jobs,
                "root_job_ids": root_jobs,
            },
            "resources": {
                "energy_available": resource_state.energy_available,
                "compute_available": resource_state.compute_available,
                "token_supply": resource_state.token_supply,
                "locked_supply": resource_state.locked_supply,
                "energy_price": self.resources.energy_price,
                "compute_price": self.resources.compute_price,
                "accounts": accounts,
            },
            "agents": self._capture_agent_snapshot(),
            "governance": {
                "worker_stake_ratio": governance.worker_stake_ratio,
                "validator_stake": governance.validator_stake,
                "approvals_required": governance.approvals_required,
                "slash_ratio": governance.slash_ratio,
                "pause_enabled": governance.pause_enabled,
                "validator_commit_window_seconds": governance.validator_commit_window.total_seconds(),
                "validator_reveal_window_seconds": governance.validator_reveal_window.total_seconds(),
            },
            "simulation": simulation_state,
            "scheduler": {
                "pending_events": len(pending_events),
                "pending_by_type": dict(pending_counts),
                "next_event": next_event_payload,
            },
        }

    async def _persist_status_snapshot(self) -> None:
        if self._status_path is None:
            return
        snapshot = self._collect_status_snapshot()
        async with self._status_lock:
            await asyncio.to_thread(self._append_snapshot_line, snapshot)

    def _append_snapshot_line(self, payload: Dict[str, Any]) -> None:
        assert self._status_path is not None
        line = json.dumps(payload, sort_keys=True)
        with self._status_path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")

