"""Long-running orchestrator for the Omega-grade demo."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
import json
import logging
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional
from uuid import uuid4

from .agents import Agent, OrchestratorProtocol
from .config import DemoConfig
from .governance import GovernanceConsole
from .logging_utils import configure_root_logger, log_json
from .messaging import MessageBus
from .resources import ResourceManager
from .simulation import PlanetarySim
from .state import Checkpoint, CommitRecord, Job, JobStatus, RevealRecord

logger = logging.getLogger(__name__)


class Orchestrator(OrchestratorProtocol):
    """Coordinates jobs, agents and validators over long horizons."""

    def __init__(
        self,
        config: DemoConfig,
        *,
        bus: Optional[MessageBus] = None,
        resources: Optional[ResourceManager] = None,
        governance: Optional[GovernanceConsole] = None,
        simulation: Optional[PlanetarySim] = None,
    ) -> None:
        configure_root_logger()
        self.config = config
        self.bus = bus or MessageBus()
        self.resources = resources or ResourceManager(config)
        self.governance = governance or GovernanceConsole(config)
        self.simulation = simulation
        self._agents: Dict[str, Agent] = {}
        self._validators: List[Agent] = []
        self._jobs: Dict[str, Job] = {}
        self._lock = asyncio.Lock()
        self._running = False
        self._last_checkpoint = datetime.now(timezone.utc)
        self._pending_validation: Dict[str, asyncio.Event] = {}
        self._background_tasks: List[asyncio.Task] = []

    # ---------------------------------------------------------------- lifecycle
    def register_agents(self, agents: Iterable[Agent], *, validators: Iterable[Agent]) -> None:
        for agent in agents:
            self._agents[agent.name] = agent
        self._validators = list(validators)
        for validator in self._validators:
            self._agents.setdefault(validator.name, validator)

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        for agent in self._agents.values():
            await agent.start()
        self._background_tasks.append(asyncio.create_task(self._rebroadcast_loop()))
        log_json(logger, "orchestrator_started", agent_count=len(self._agents))

    async def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        for agent in self._agents.values():
            await agent.stop()
        for task in self._background_tasks:
            task.cancel()
        self._background_tasks.clear()
        log_json(logger, "orchestrator_stopped")

    async def run(self, *, cycles: Optional[int] = None, cycle_sleep: float = 0.5) -> None:
        await self.start()
        iteration = 0
        try:
            while self._running and (cycles is None or iteration < cycles):
                iteration += 1
                await self._maybe_checkpoint()
                await asyncio.sleep(cycle_sleep)
        finally:
            await self.stop()

    # ------------------------------------------------------------------ job flow
    async def post_alpha_job(
        self,
        spec: MutableMapping[str, Any],
        *,
        employer: str,
        reward: Optional[float] = None,
        parent_id: Optional[str] = None,
        deadline: Optional[datetime] = None,
    ) -> str:
        reward_amount = reward or self.config.default_reward
        stake = reward_amount * self.config.stake_ratio
        job_id = str(uuid4())
        deadline = deadline or datetime.now(timezone.utc) + timedelta(hours=6)
        job = Job(
            job_id=job_id,
            spec=spec,
            employer=employer,
            reward=reward_amount,
            stake_required=stake,
            deadline=deadline,
            parent_id=parent_id,
        )
        async with self._lock:
            self._jobs[job_id] = job
            if parent_id and parent_id in self._jobs:
                self._jobs[parent_id].add_child(job_id)
        self.resources.ensure_account(employer)
        await self.bus.publish(self._topic_for_spec(spec), {"type": "job_posted", "job_id": job_id, "spec": spec})
        log_json(logger, "job_posted", job_id=job_id, parent_id=parent_id, employer=employer)
        return job_id

    async def delegate_job(
        self,
        agent: Agent,
        *,
        spec: MutableMapping[str, Any],
        reward: Optional[float] = None,
    ) -> str:
        return await self.post_alpha_job(spec, employer=agent.name, reward=reward, parent_id=spec.get("parent"))

    def _topic_for_spec(self, spec: Mapping[str, Any]) -> str:
        skills = spec.get("skills") or []
        if not skills:
            return "jobs:general"
        return f"jobs:{skills[0]}"

    async def apply_for_job(self, job_id: str, agent: Agent) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status is not JobStatus.POSTED:
                return
            if self.governance.paused:
                return
            job.status = JobStatus.IN_PROGRESS
            job.assignee = agent.name
            job.touch()
        self.resources.ensure_account(agent.name)
        self.resources.stake(agent.name, job.stake_required)
        asyncio.create_task(self._execute_job(agent, job_id))
        log_json(logger, "job_accepted", job_id=job_id, agent=agent.name)

    async def _execute_job(self, agent: Agent, job_id: str) -> None:
        try:
            job = self._jobs[job_id]
        except KeyError:  # pragma: no cover - defensive
            return
        compute = float(job.spec.get("compute", 1.0))
        energy = float(job.spec.get("energy_gw", 1.0))
        try:
            self.resources.consume(compute_pf=compute, energy_gw=energy)
            result = await agent.execute_job(job)
            job.result = dict(result)
            job.compute_cost = compute
            job.energy_cost = energy
            job.status = JobStatus.AWAITING_VALIDATION
            job.touch()
            await self._schedule_validation(job)
        except Exception as exc:  # pragma: no cover - defensive
            job.status = JobStatus.FAILED
            job.touch()
            self.resources.release_stake(agent.name, job.stake_required, slash=True)
            log_json(logger, "job_failed", job_id=job_id, agent=agent.name, error=str(exc))
        finally:
            self.resources.release(compute_pf=compute, energy_gw=energy)

    async def _schedule_validation(self, job: Job) -> None:
        event = asyncio.Event()
        self._pending_validation[job.job_id] = event
        digest = json.dumps(job.result, sort_keys=True)
        await self.bus.publish("validation:commit", {"job_id": job.job_id, "result_digest": digest})
        log_json(logger, "validation_commit_phase", job_id=job.job_id)
        await asyncio.sleep(self.config.commit_window.total_seconds())
        await self.bus.publish(
            "validation:reveal",
            {"job_id": job.job_id, "suggested_verdict": True, "result": job.result},
        )
        log_json(logger, "validation_reveal_phase", job_id=job.job_id)
        await event.wait()

    async def receive_commit(self, job_id: str, agent: Agent, digest: str) -> None:
        async with self._lock:
            job = self._jobs[job_id]
            if any(record.validator == agent.name for record in job.commits):
                return
            job.commits.append(CommitRecord(validator=agent.name, commit_hash=digest, committed_at=datetime.now(timezone.utc)))
            job.touch()
        log_json(logger, "validator_commit", job_id=job_id, validator=agent.name)

    async def receive_reveal(self, job_id: str, agent: Agent, verdict: bool) -> None:
        async with self._lock:
            job = self._jobs[job_id]
            if any(record.validator == agent.name for record in job.reveals):
                return
            job.reveals.append(
                RevealRecord(validator=agent.name, verdict=verdict, revealed_at=datetime.now(timezone.utc))
            )
            job.touch()
            reveals = len(job.reveals)
        log_json(logger, "validator_reveal", job_id=job_id, validator=agent.name, verdict=verdict)
        if reveals >= self.config.validator_count:
            await self._finalise_job(job_id)

    async def _finalise_job(self, job_id: str) -> None:
        async with self._lock:
            job = self._jobs[job_id]
            approvals = sum(1 for record in job.reveals if record.verdict)
            accepted = approvals >= max(1, self.config.validator_count // 2 + 1)
            agent_name = job.assignee
        if not agent_name:
            return
        if accepted:
            self.resources.release_stake(agent_name, job.stake_required, slash=False)
            self.resources.credit(agent_name, job.reward)
            job.status = JobStatus.COMPLETED
            if job.parent_id and job.parent_id in self._jobs:
                parent = self._jobs[job.parent_id]
                if parent.status == JobStatus.IN_PROGRESS:
                    parent.result = parent.result or {}
                    parent.result.setdefault("children", []).append({"job_id": job.job_id, "result": job.result})
        else:
            self.resources.release_stake(agent_name, job.stake_required, slash=True)
            job.status = JobStatus.FAILED
        job.touch()
        event = self._pending_validation.pop(job_id, None)
        if event:
            event.set()
        log_json(logger, "job_finalised", job_id=job_id, status=job.status.value)

    # --------------------------------------------------------------- checkpointing
    async def _maybe_checkpoint(self) -> None:
        now = datetime.now(timezone.utc)
        if now - self._last_checkpoint < self.config.checkpoint_interval:
            return
        await self._checkpoint()
        self._last_checkpoint = now

    async def _checkpoint(self) -> None:
        checkpoint = Checkpoint(
            created_at=datetime.now(timezone.utc),
            jobs=list(self._jobs.values()),
            resource_state=self.resources.snapshot(),
            config=self.config.snapshot(),
        )
        path = Path(self.config.checkpoint_path)
        path.write_text(json.dumps(checkpoint.to_dict(), indent=2))
        log_json(logger, "checkpoint_written", path=str(path))

    async def _rebroadcast_loop(self) -> None:
        try:
            while self._running:
                await asyncio.sleep(0.2)
                if self.governance.paused:
                    continue
                posted: List[Job]
                async with self._lock:
                    posted = [job for job in self._jobs.values() if job.status is JobStatus.POSTED]
                for job in posted:
                    await self.bus.publish(
                        self._topic_for_spec(job.spec), {"type": "job_posted", "job_id": job.job_id, "spec": job.spec}
                    )
        except asyncio.CancelledError:  # pragma: no cover - expected on shutdown
            return

    # --------------------------------------------------------------- admin access
    def governance_console(self) -> GovernanceConsole:
        return self.governance

    def jobs(self) -> Mapping[str, Job]:
        return dict(self._jobs)

    def balances(self) -> Mapping[str, Mapping[str, float]]:
        return self.resources.balances()

    @classmethod
    def load_from_checkpoint(
        cls,
        checkpoint_path: str,
        config: DemoConfig,
        *,
        bus: Optional[MessageBus] = None,
        resources: Optional[ResourceManager] = None,
        governance: Optional[GovernanceConsole] = None,
        simulation: Optional[PlanetarySim] = None,
    ) -> "Orchestrator":
        orchestrator = cls(
            config,
            bus=bus,
            resources=resources,
            governance=governance,
            simulation=simulation,
        )
        path = Path(checkpoint_path)
        if path.exists():
            payload = json.loads(path.read_text())
            for job_payload in payload.get("jobs", []):
                job = Job(
                    job_id=job_payload["job_id"],
                    spec=job_payload["spec"],
                    employer=job_payload["employer"],
                    reward=job_payload["reward"],
                    stake_required=job_payload["stake_required"],
                    deadline=datetime.fromisoformat(job_payload["deadline"]),
                    parent_id=job_payload.get("parent_id"),
                )
                job.status = JobStatus(job_payload["status"])
                orchestrator._jobs[job.job_id] = job
        return orchestrator
