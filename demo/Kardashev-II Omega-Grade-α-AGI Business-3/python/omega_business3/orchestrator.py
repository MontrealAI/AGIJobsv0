from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from .agents import AgentBase, EnergyAgent, FinanceAgent, StrategyAgent, ValidatorAgent
from .checkpoint import OrchestratorState, StateStore
from .config import OmegaConfig
from .job import Job, JobRegistry, JobStatus
from .logging import create_logger, log_structured
from .messaging import MessageBus
from .resources import ResourceManager
from .simulation import PlanetarySim, build_simulation


@dataclass
class Assignment:
    job: Job
    agent: AgentBase
    task: asyncio.Task[None]
    stake: float


class OmegaOrchestrator:
    def __init__(self, config: OmegaConfig, base_path: Path) -> None:
        self.config = config
        self.base_path = base_path
        self.logger = create_logger("kardashev_omega", str(base_path / config.log_path))
        self.registry = JobRegistry()
        self.bus = MessageBus()
        rm_cfg = config.resource_manager
        self.resource_manager = ResourceManager(
            planetary_energy_gw=float(rm_cfg.get("planetary_energy_gw", 0.0)),
            planetary_compute_pf=float(rm_cfg.get("planetary_compute_pf", 0.0)),
            token_supply=float(rm_cfg.get("token_supply", 0.0)),
            token_per_energy=float(rm_cfg.get("token_per_energy", 0.01)),
            token_per_compute=float(rm_cfg.get("token_per_compute", 0.01)),
            dynamic_inflation_threshold=float(rm_cfg.get("dynamic_inflation_threshold", 0.8)),
            scarcity_multiplier=float(rm_cfg.get("scarcity_multiplier", 1.1)),
        )
        self.simulation: PlanetarySim | None = build_simulation(asdict(config.simulation)) if config.simulation else None
        self.state_store = StateStore(base_path / config.state_path)
        self.agents: Dict[str, AgentBase] = {}
        self.validators: List[ValidatorAgent] = []
        self.assignments: Dict[str, Assignment] = {}
        self.paused = False
        self._checkpoint_task: Optional[asyncio.Task[None]] = None
        self._lock = asyncio.Lock()
        self._stop_event = asyncio.Event()
        self._load_agents()
        self._load_state()

    def _load_agents(self) -> None:
        for agent_cfg in self.config.agents:
            tokens = agent_cfg.stake * 2
            self.resource_manager.register(agent_cfg.name, tokens, agent_cfg.energy_allowance, agent_cfg.compute_allowance)
            skill_set = set(agent_cfg.skills)
            if {"validation", "audit", "governance"}.intersection(skill_set):
                agent = ValidatorAgent(agent_cfg.name, agent_cfg.skills, self, self.resource_manager)
                self.validators.append(agent)
            elif "energy" in skill_set:
                agent = EnergyAgent(agent_cfg.name, agent_cfg.skills, self, self.resource_manager)
                self.agents[agent_cfg.name] = agent
            elif "finance" in skill_set:
                agent = FinanceAgent(agent_cfg.name, agent_cfg.skills, self, self.resource_manager)
                self.agents[agent_cfg.name] = agent
            else:
                agent = StrategyAgent(agent_cfg.name, agent_cfg.skills, self, self.resource_manager)
                self.agents[agent_cfg.name] = agent
        for validator in self.validators:
            self.agents.setdefault(validator.name, validator)

    def _load_state(self) -> None:
        state = self.state_store.load()
        if not state:
            return
        self.registry = JobRegistry.from_dict(state.jobs)
        self.resource_manager.restore(state.resources)
        self.paused = state.paused
        log_structured(self.logger, "state_restored", job_count=len(self.registry.jobs()), paused=self.paused)

    async def start(self) -> None:
        for agent in self.agents.values():
            await agent.start()
        self._checkpoint_task = asyncio.create_task(self._checkpoint_loop())
        if not self.registry.jobs():
            await self._seed_demo_jobs()

    async def stop(self) -> None:
        self._stop_event.set()
        for assignment in list(self.assignments.values()):
            assignment.task.cancel()
        for agent in self.agents.values():
            await agent.stop()
        if self._checkpoint_task:
            self._checkpoint_task.cancel()
            try:
                await self._checkpoint_task
            except asyncio.CancelledError:
                pass
        await self._checkpoint()

    async def _checkpoint_loop(self) -> None:
        while not self._stop_event.is_set():
            await asyncio.sleep(self.config.checkpoint_interval_seconds)
            await self._checkpoint()

    async def _checkpoint(self) -> None:
        state = OrchestratorState(
            jobs=self.registry.to_dict(),
            resources=self.resource_manager.to_state(),
            paused=self.paused,
        )
        self.state_store.save(state)
        log_structured(self.logger, "checkpoint", jobs=len(state.jobs))

    async def _seed_demo_jobs(self) -> None:
        for job_spec in self.config.demo_jobs:
            await self.post_alpha_job(
                title=job_spec.title,
                description=job_spec.description,
                reward=job_spec.reward,
                energy_budget=job_spec.energy_budget,
                compute_budget=job_spec.compute_budget,
                deadline_hours=job_spec.deadline_hours,
                skills=job_spec.skills,
                owner="omega_launch",
            )

    async def post_alpha_job(
        self,
        *,
        title: str,
        description: str,
        reward: float,
        energy_budget: float,
        compute_budget: float,
        deadline_hours: float,
        skills: Iterable[str],
        owner: str,
        parent: Job | None = None,
    ) -> Job:
        deadline = datetime.now(timezone.utc) + timedelta(hours=deadline_hours)
        job = Job(
            title=title,
            reward=reward,
            deadline=deadline,
            energy_budget=energy_budget,
            compute_budget=compute_budget,
            description=description,
            skills=list(skills),
            owner=owner,
        )
        if parent:
            job.parent_id = parent.job_id
            job.lineage = parent.lineage + [parent.job_id]
        self.registry.add_job(job)
        log_structured(self.logger, "job_posted", job_id=job.job_id, title=job.title, reward=reward, owner=owner)
        for skill in job.skills:
            self.bus.publish(f"jobs:{skill}", {"job_id": job.job_id})
        self.bus.publish("jobs:*", {"job_id": job.job_id})
        return job

    async def delegate_job(self, agent: AgentBase, spec: Dict[str, float], deadline_hours: float, parent_job: Job | None = None) -> Job:
        job = await self.post_alpha_job(
            title=str(spec.get("title", f"Delegated by {agent.name}")),
            description=str(spec.get("description", "")),
            reward=float(spec.get("reward", 0.0)),
            energy_budget=float(spec.get("energy_budget", 0.0)),
            compute_budget=float(spec.get("compute_budget", 0.0)),
            deadline_hours=deadline_hours,
            skills=list(spec.get("skills", [])),
            owner=agent.name,
            parent=parent_job,
        )
        return job

    async def assign_job(self, job: Job, agent: AgentBase) -> None:
        async with self._lock:
            if job.job_id in self.assignments or job.assigned_agent:
                return
            ratio = self.config.validators.stake_ratio if self.config.validators else 0.05
            stake_amount = max(job.reward * ratio, 1.0)
            self.resource_manager.stake(agent.name, stake_amount)
            self.registry.assign(job.job_id, agent.name)
            task = asyncio.create_task(self._execute_job(job, agent, stake_amount))
            self.assignments[job.job_id] = Assignment(job=job, agent=agent, task=task, stake=stake_amount)
            log_structured(self.logger, "job_assigned", job_id=job.job_id, agent=agent.name)

    async def _execute_job(self, job: Job, agent: AgentBase, stake_amount: float) -> None:
        try:
            result = await agent.handle_job(job)
            job.result = result
            self.registry.mark_status(job.job_id, JobStatus.VALIDATING)
            approved = await self._validate_job(job)
            if approved:
                await self._finalise_success(job, agent, stake_amount)
            else:
                await self._handle_failure(job, agent, stake_amount)
        except Exception as exc:  # noqa: BLE001
            log_structured(self.logger, "job_error", job_id=job.job_id, agent=agent.name, error=str(exc))
            await self._handle_failure(job, agent, stake_amount)
        finally:
            self.assignments.pop(job.job_id, None)

    async def _validate_job(self, job: Job) -> bool:
        if not self.validators:
            return True
        approvals = 0
        required = self.config.validators.quorum if self.config.validators else max(1, len(self.validators))
        for validator in self.validators:
            verdict, salt = await validator.validate(job, job.result or {})
            log_structured(self.logger, "validator_vote", job_id=job.job_id, validator=validator.name, verdict=verdict, salt=salt)
            if verdict == "approve":
                approvals += 1
        reveal_delay = self.config.validators.reveal_phase_seconds if self.config.validators else 0
        if reveal_delay:
            await asyncio.sleep(reveal_delay)
        return approvals >= required

    async def _finalise_success(self, job: Job, agent: AgentBase, stake_amount: float) -> None:
        self.registry.mark_status(job.job_id, JobStatus.COMPLETED)
        reward = job.reward
        self.resource_manager.reward(agent.name, reward)
        self.resource_manager.release_stake(agent.name, stake_amount)
        log_structured(self.logger, "job_completed", job_id=job.job_id, agent=agent.name, reward=reward)
        if job.parent_id and not self.registry.outstanding_dependencies(job.parent_id):
            parent = self.registry.get(job.parent_id)
            if parent.assigned_agent:
                await self._finalise_success(parent, self.agents[parent.assigned_agent], stake_amount)

    async def _handle_failure(self, job: Job, agent: AgentBase, stake_amount: float) -> None:
        self.registry.mark_status(job.job_id, JobStatus.FAILED)
        slash_ratio = self.config.validators.slash_ratio if self.config.validators else 0.2
        self.resource_manager.slash(agent.name, job.reward * slash_ratio)
        log_structured(self.logger, "job_failed", job_id=job.job_id, agent=agent.name)
        self.resource_manager.release_stake(agent.name, max(stake_amount - job.reward * slash_ratio, 0.0))

    async def run(self, cycles: Optional[int] = None) -> None:
        await self.start()
        cycle = 0
        try:
            while not self._stop_event.is_set():
                if not self.paused:
                    await self._monitor_jobs()
                    self.resource_manager.rebalance_pricing()
                cycle += 1
                if cycles and cycle >= cycles:
                    break
                await asyncio.sleep(0.2)
        finally:
            await self.stop()

    async def _monitor_jobs(self) -> None:
        now = datetime.now(timezone.utc)
        for job in list(self.registry.jobs()):
            if job.status in {JobStatus.PENDING, JobStatus.ACTIVE} and job.is_overdue(now):
                agent = self.agents.get(job.assigned_agent) if job.assigned_agent else None
                if agent:
                    assignment = self.assignments.get(job.job_id)
                    ratio = self.config.validators.stake_ratio if self.config.validators else 0.05
                    stake_amount = assignment.stake if assignment else job.reward * ratio
                    await self._handle_failure(job, agent, stake_amount)
                else:
                    self.registry.mark_status(job.job_id, JobStatus.CANCELLED)
                    log_structured(self.logger, "job_cancelled", job_id=job.job_id)

    def pause(self) -> None:
        self.paused = True
        log_structured(self.logger, "paused", timestamp=datetime.now(timezone.utc).isoformat())

    def resume(self) -> None:
        self.paused = False
        log_structured(self.logger, "resumed", timestamp=datetime.now(timezone.utc).isoformat())

    def snapshot_state(self) -> OrchestratorState:
        return OrchestratorState(
            jobs=self.registry.to_dict(),
            resources=self.resource_manager.to_state(),
            paused=self.paused,
        )

    def persist_state(self) -> None:
        state = self.snapshot_state()
        self.state_store.save(state)
        log_structured(self.logger, "state_saved", jobs=len(state.jobs))
