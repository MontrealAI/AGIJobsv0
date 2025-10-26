"""Agent implementations for the omega upgrade demo."""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Optional

from .jobs import JobRecord, JobSpec, JobStatus
from .messaging import MessageBus
from .resources import ResourceManager


DelegateFn = Callable[[JobSpec], Awaitable[JobRecord]]
GovernanceFn = Callable[[str, dict[str, object]], Awaitable[None]]


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
    """Abstract base for omega agents."""

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
    """Executes jobs using skills and may spawn sub-jobs."""

    def __init__(self, context: AgentContext, efficiency: float = 1.0) -> None:
        super().__init__(context)
        self.efficiency = efficiency

    async def run(self) -> None:  # noqa: D401
        pattern = f"jobs:{self.context.name}"
        async with self.context.bus.subscribe(pattern) as receiver:
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
        energy_cost = min(spec.energy_budget, workload * 0.6)
        compute_cost = min(spec.compute_budget, workload)
        try:
            await asyncio.sleep(min(5.0, workload / 900))
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
            if spec.compute_budget > 5_000:
                sub_spec = JobSpec(
                    title=f"Optimization cycle for {spec.title}",
                    description="Recursive refinement spawned by worker due to high compute demand.",
                    required_skills=[self.context.name],
                    reward_tokens=spec.reward_tokens * 0.15,
                    deadline=datetime.now(timezone.utc) + timedelta(hours=3),
                    validation_window=timedelta(hours=1),
                    parent_id=job_id,
                    energy_budget=spec.energy_budget * 0.2,
                    compute_budget=spec.compute_budget * 0.3,
                    metadata={"employer": self.context.name},
                )
                await self.delegate(sub_spec)
        except Exception as exc:  # pragma: no cover - defensive
            self.telemetry.jobs_failed += 1
            self._record_event(action="error", error=str(exc))
        finally:
            self.context.resources.release_resources(self.context.name, energy_cost, compute_cost)


class StrategistAgent(AgentBase):
    """High-level planner that generates sub-jobs recursively."""

    def __init__(self, context: AgentContext, orchestrator_delegate: DelegateFn, seed: Optional[str] = None) -> None:
        super().__init__(context)
        self._delegate_to_orchestrator = orchestrator_delegate
        self._seed = seed

    async def run(self) -> None:  # noqa: D401
        listeners = [self.context.bus.subscribe("insights"), self.context.bus.subscribe("control:seed")]
        async with listeners[0] as insight_receiver, listeners[1] as seed_receiver:
            if self._seed:
                await self._synthesize_plan(self._seed)
            while self._running:
                done, pending = await asyncio.wait(
                    [asyncio.create_task(insight_receiver()), asyncio.create_task(seed_receiver())],
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in done:
                    message = task.result()
                    if message.topic == "insights":
                        await self._synthesize_plan(message.payload["idea"])
                    else:
                        payload = message.payload.get("payload", {})
                        title = payload.get("title", "Operator Seeded Initiative")
                        await self._synthesize_plan(title)
                for task in pending:
                    task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await task

    async def _synthesize_plan(self, idea: str) -> None:
        child_spec = JobSpec(
            title=f"Execution plan for {idea}",
            description=f"Plan derived from strategic insight {idea}",
            required_skills=["dyson-assembler"],
            reward_tokens=450.0,
            deadline=datetime.now(timezone.utc) + timedelta(hours=8),
            validation_window=timedelta(hours=2),
            energy_budget=750.0,
            compute_budget=2_000.0,
            metadata={"employer": self.context.name},
        )
        await self._delegate_to_orchestrator(child_spec)
        self._record_event(action="delegate", idea=idea)


class ValidatorAgent(AgentBase):
    """Validator performing commit-reveal voting."""

    def __init__(self, context: AgentContext, honesty: float = 0.97) -> None:
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


class GovernanceAgent(AgentBase):
    """Listens for governance directives and applies them via orchestrator."""

    def __init__(self, context: AgentContext, governance_delegate: GovernanceFn) -> None:
        super().__init__(context)
        self._delegate = governance_delegate

    async def run(self) -> None:  # noqa: D401
        async with self.context.bus.subscribe("control:govern") as receiver:
            while self._running:
                message = await receiver()
                payload = message.payload.get("payload", {})
                await self._delegate(self.context.name, payload)
                self._record_event(action="govern", changes=str(payload))


async def spawn_agent(name: str, agent: AgentBase) -> asyncio.Task[None]:
    return asyncio.create_task(agent.run(), name=name)
