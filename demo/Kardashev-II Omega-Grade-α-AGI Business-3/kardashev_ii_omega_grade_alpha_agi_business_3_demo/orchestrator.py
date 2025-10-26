"""Omega-grade orchestrator coordinating agents, jobs, and resources."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .agents import AgentContext, StrategistAgent, ValidatorAgent, WorkerAgent, spawn_agent
from .checkpoint import CheckpointManager
from .governance import GovernanceController, GovernanceParameters
from .jobs import JobRecord, JobRegistry, JobSpec, JobStatus
from .logging_config import configure_logging
from .messaging import MessageBus
from .resources import ResourceManager
from .simulation import PlanetarySimulation, SyntheticEconomySim


@dataclass
class OrchestratorConfig:
    mission_name: str = "Kardashev-II Omega-Grade α-AGI Business 3"
    checkpoint_path: Path = Path("checkpoint.json")
    checkpoint_interval_seconds: int = 60
    resume_from_checkpoint: bool = True
    enable_simulation: bool = True
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


class Orchestrator:
    """Coordinates agents, jobs, validators, resources, and simulation."""

    def __init__(self, config: OrchestratorConfig) -> None:
        configure_logging()
        self.log = logging.getLogger("omega.orchestrator")
        self.config = config
        self.bus = MessageBus()
        self.resources = ResourceManager(
            energy_capacity=config.energy_capacity,
            compute_capacity=config.compute_capacity,
            base_token_supply=config.base_agent_tokens * 10,
        )
        self.job_registry = JobRegistry()
        self.checkpoint = CheckpointManager(config.checkpoint_path)
        self.governance = GovernanceController(config.governance)
        self.simulation: Optional[PlanetarySimulation] = SyntheticEconomySim() if config.enable_simulation else None
        self._tasks: List[asyncio.Task] = []
        self._running = False
        self._paused = asyncio.Event()
        self._paused.set()
        self._cycle = 0
        self._stopped = asyncio.Event()

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
        if self.simulation:
            self._tasks.append(asyncio.create_task(self._simulation_loop(), name="simulation"))
        await self._seed_jobs()
        self._tasks.append(asyncio.create_task(self._cycle_loop(), name="cycles"))

    async def _bootstrap_state(self) -> None:
        if self.config.resume_from_checkpoint:
            snapshot = self.checkpoint.load()
            if snapshot:
                job_records = self._rehydrate_jobs(snapshot.get("jobs", {}))
                if job_records:
                    self.job_registry.rehydrate(job_records)
                self._info("state_rehydrated", job_count=len(job_records))
                for agent, balances in snapshot.get("resources", {}).items():
                    account = self.resources.ensure_account(agent)
                    account.tokens = balances["tokens"]
                    account.locked = balances["locked"]
                    account.energy_quota = balances["energy_quota"]
                    account.compute_quota = balances["compute_quota"]
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

    async def _spawn_agents(self) -> List[asyncio.Task[None]]:
        tasks: List[asyncio.Task[None]] = []
        for name, efficiency in self.config.worker_specs.items():
            context = AgentContext(name=name, skills={name}, bus=self.bus, resources=self.resources)
            agent = WorkerAgent(context, efficiency=efficiency, post_job=self.post_alpha_job)
            tasks.append(await spawn_agent(f"worker:{name}", agent))
        for name in self.config.strategist_names:
            context = AgentContext(name=name, skills={"strategy"}, bus=self.bus, resources=self.resources)
            agent = StrategistAgent(
                context,
                post_job=self.post_alpha_job,
                delegation_skills=list(self.config.worker_specs.keys()),
            )
            tasks.append(await spawn_agent(f"strategist:{name}", agent))
        for name in self.config.validator_names:
            context = AgentContext(name=name, skills={"validation"}, bus=self.bus, resources=self.resources)
            agent = ValidatorAgent(context, self.governance)
            tasks.append(await spawn_agent(f"validator:{name}", agent))
        return tasks

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
            await asyncio.sleep(self.config.insight_interval_seconds)

    async def _simulation_loop(self) -> None:
        assert self.simulation is not None
        while self._running:
            await self._paused.wait()
            state = self.simulation.tick(hours=1)
            self._info(
                "simulation_tick",
                energy_output=state.energy_output_gw,
                prosperity=state.prosperity_index,
                sustainability=state.sustainability_index,
            )
            await asyncio.sleep(1)

    async def _seed_jobs(self) -> None:
        if any(self.job_registry.iter_jobs()):
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

    async def _checkpoint_loop(self) -> None:
        while self._running:
            await self._paused.wait()
            await asyncio.sleep(self.config.checkpoint_interval_seconds)
            self.checkpoint.save(
                {record.job_id: record for record in self.job_registry.iter_jobs()},
                self.resources,
            )
            snapshot = self.resources.snapshot()
            self._info(
                "checkpoint_saved",
                jobs=len(list(self.job_registry.iter_jobs())),
                energy_available=snapshot.energy_available,
                compute_available=snapshot.compute_available,
            )

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
            )
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
        record = self.job_registry.mark_completed(job_id, summary, energy_used, compute_used)
        await self._initiate_validation(record)

    async def _handle_reveal(self, job_id: str, validator: str, vote: bool) -> None:
        job = self.job_registry.get_job(job_id)
        job.validator_votes[validator] = vote
        approvals = sum(1 for v in job.validator_votes.values() if v)
        if self.governance.require_quorum(approvals):
            await self._finalize_job(job)

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
        asyncio.create_task(self._schedule_deadline(record), name=f"deadline:{record.job_id}")
        await self.bus.publish(
            topic=f"jobs:{spec.required_skills[0] if spec.required_skills else 'general'}",
            payload={"spec": spec, "job_id": record.job_id},
            publisher="orchestrator",
        )
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
        return job

    async def _schedule_deadline(self, job: JobRecord) -> None:
        await asyncio.sleep(max(0.0, (job.spec.deadline - datetime.now(timezone.utc)).total_seconds()))
        if job.status in {JobStatus.FINALIZED, JobStatus.CANCELLED}:
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

    async def _initiate_validation(self, job: JobRecord) -> None:
        for validator in self.config.validator_names:
            self.resources.lock_stake(validator, self.governance.params.validator_stake)
            await self.bus.publish(
                f"validation:request:{job.job_id}",
                {"validator": validator, "job_id": job.job_id},
                "orchestrator",
            )
        await asyncio.sleep(self.governance.params.validator_commit_window.total_seconds())
        await asyncio.sleep(self.governance.params.validator_reveal_window.total_seconds())
        await self._finalize_job(job)

    async def _finalize_job(self, job: JobRecord) -> None:
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
        for validator in self.config.validator_names:
            self.resources.release_stake(validator, self.governance.params.validator_stake)
        self._info("job_finalized", job_id=job.job_id, status=job.status.value)

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
        self.checkpoint.save(
            {record.job_id: record for record in self.job_registry.iter_jobs()},
            self.resources,
        )
        self._info("orchestrator_stopped")
        self._stopped.set()

    async def wait_until_stopped(self) -> None:
        await self._stopped.wait()

