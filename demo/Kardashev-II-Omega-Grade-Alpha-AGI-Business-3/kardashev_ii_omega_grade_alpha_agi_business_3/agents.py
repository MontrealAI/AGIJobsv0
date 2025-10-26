"""Agent implementations and behaviors."""

from __future__ import annotations

import asyncio
import hashlib
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from .jobs import JobRecord, JobSpec, JobStatus
from .messaging import MessageBus
from .resources import ResourceManager


@dataclass
class AgentContext:
    name: str
    skills: set[str]
    bus: MessageBus
    resources: ResourceManager


@dataclass
class AgentTelemetry:
    jobs_completed: int = 0
    jobs_failed: int = 0
    tokens_earned: float = 0.0
    energy_consumed: float = 0.0
    compute_consumed: float = 0.0
    log: list[dict[str, str]] = field(default_factory=list)


class AgentBase:
    """Abstract base for all demo agents."""

    def __init__(self, context: AgentContext) -> None:
        self.context = context
        self.telemetry = AgentTelemetry()
        self._running = True

    async def run(self) -> None:
        raise NotImplementedError

    async def shutdown(self) -> None:
        self._running = False

    async def delegate(self, spec: JobSpec) -> None:
        await self.context.bus.publish(
            topic=f"jobs:{spec.required_skills[0] if spec.required_skills else 'general'}",
            payload={"spec": spec},
            publisher=self.context.name,
        )

    def _record_event(self, **kwargs: str) -> None:
        self.telemetry.log.append({"timestamp": datetime.now(timezone.utc).isoformat(), **kwargs})


class WorkerAgent(AgentBase):
    """Executes jobs using local skills and can spawn sub-jobs."""

    def __init__(self, context: AgentContext, efficiency: float = 1.0) -> None:
        super().__init__(context)
        self.efficiency = efficiency

    async def run(self) -> None:  # noqa: D401 - base contract
        async with self.context.bus.subscribe(f"jobs:{self.context.name}") as receiver:
            while self._running:
                message = await receiver()
                spec: JobSpec = message.payload["spec"]
                job_id: str = message.payload["job_id"]
                await self.context.bus.publish(
                    topic="jobs:claim",
                    payload={"job_id": job_id, "agent": self.context.name},
                    publisher=self.context.name,
                )
                await self._execute_job(job_id, spec)

    async def _execute_job(self, job_id: str, spec: JobSpec) -> None:
        workload = max(1.0, spec.compute_budget / max(self.efficiency, 0.1))
        energy_cost = min(spec.energy_budget, workload * 0.5)
        compute_cost = min(spec.compute_budget, workload)
        try:
            await asyncio.sleep(min(3.0, workload / 1000))
            self.context.resources.allocate_resources(self.context.name, energy_cost, compute_cost)
            result_summary = f"{self.context.name} completed {spec.title}"
            self.telemetry.jobs_completed += 1
            self.telemetry.tokens_earned += spec.reward_tokens
            self.telemetry.energy_consumed += energy_cost
            self.telemetry.compute_consumed += compute_cost
            self._record_event(action="complete", job=spec.title)
            await self.context.bus.publish(
                topic=f"results:{spec.parent_id or 'root'}",
                payload={
                    "summary": result_summary,
                    "job_title": spec.title,
                    "job_id": job_id,
                    "energy_used": energy_cost,
                    "compute_used": compute_cost,
                },
                publisher=self.context.name,
            )
        finally:
            self.context.resources.release_resources(self.context.name, energy_cost, compute_cost)


class StrategistAgent(AgentBase):
    """High-level planner that generates sub-jobs recursively."""

    def __init__(self, context: AgentContext, orchestrator_delegate: callable) -> None:
        super().__init__(context)
        self._delegate_to_orchestrator = orchestrator_delegate

    async def run(self) -> None:  # noqa: D401
        async with self.context.bus.subscribe("insights") as receiver:
            while self._running:
                message = await receiver()
                idea = message.payload["idea"]
                await self._synthesize_plan(idea)

    async def _synthesize_plan(self, idea: str) -> None:
        child_spec = JobSpec(
            title=f"Execution plan for {idea}",
            description=f"Plan derived from strategic insight {idea}",
            required_skills=["dyson-assembler"],
            reward_tokens=250.0,
            deadline=datetime.now(timezone.utc) + timedelta(hours=6),
            validation_window=timedelta(hours=2),
            energy_budget=500.0,
            compute_budget=1_000.0,
            metadata={"employer": self.context.name},
        )
        await self._delegate_to_orchestrator(child_spec)
        self._record_event(action="delegate", idea=idea)


class ValidatorAgent(AgentBase):
    """Validator performing commit-reveal voting."""

    def __init__(self, context: AgentContext, honesty: float = 0.95) -> None:
        super().__init__(context)
        self.honesty = honesty

    async def run(self) -> None:  # noqa: D401
        async with self.context.bus.subscribe("validation") as receiver:
            while self._running:
                message = await receiver()
                job: JobRecord = message.payload["job"]
                phase: str = message.payload["phase"]
                if phase == "commit":
                    commit_hash = self._commit(job)
                    await self.context.bus.publish(
                        topic=f"validation:commit:{job.job_id}",
                        payload={"commit": commit_hash, "validator": self.context.name},
                        publisher=self.context.name,
                    )
                elif phase == "reveal":
                    decision = self._reveal(job)
                    await self.context.bus.publish(
                        topic=f"validation:reveal:{job.job_id}",
                        payload={"vote": decision, "validator": self.context.name},
                        publisher=self.context.name,
                    )

    def _commit(self, job: JobRecord) -> str:
        digest = hashlib.sha256(f"{job.job_id}:{self.context.name}".encode()).hexdigest()
        self._record_event(action="commit", job=job.job_id)
        return digest

    def _reveal(self, job: JobRecord) -> bool:
        truthful = random.random() < self.honesty
        outcome = job.status == JobStatus.COMPLETED if truthful else not job.status == JobStatus.COMPLETED
        self._record_event(action="reveal", job=job.job_id, decision=str(outcome))
        return outcome


async def spawn_agent(name: str, agent: AgentBase) -> asyncio.Task[None]:
    return asyncio.create_task(agent.run(), name=name)
