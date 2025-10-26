"""Agent definitions for the Omega-grade demo."""

from __future__ import annotations

import asyncio
import hashlib
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Dict, Iterable, List, Optional

from .governance import GovernanceController
from .jobs import JobRecord, JobRegistry, JobSpec, JobStatus
from .messaging import MessageBus
from .resources import ResourceManager


@dataclass(slots=True)
class AgentContext:
    name: str
    skills: Iterable[str]
    bus: MessageBus
    resources: ResourceManager


class AgentBase:
    """Base class providing shared behaviour."""

    def __init__(self, context: AgentContext) -> None:
        self.context = context
        self._task: Optional[asyncio.Task[None]] = None

    async def start(self) -> asyncio.Task[None]:
        if self._task is None:
            self._task = asyncio.create_task(self.run(), name=f"agent:{self.context.name}")
        return self._task

    async def run(self) -> None:  # pragma: no cover - to be implemented by subclasses
        raise NotImplementedError

    async def delegate(self, spec: JobSpec, post_job: Callable[[JobSpec], asyncio.Future]) -> str:
        record: JobRecord = await post_job(spec)
        return record.job_id


class WorkerAgent(AgentBase):
    """Task execution agents subscribing to skill channels."""

    def __init__(self, context: AgentContext, efficiency: float, post_job: Callable[[JobSpec], asyncio.Future]) -> None:
        super().__init__(context)
        self.efficiency = efficiency
        self.post_job = post_job
        self._assignment_events: Dict[str, asyncio.Event] = {}

    async def run(self) -> None:
        skill_topics = [f"jobs:{skill}" for skill in self.context.skills]
        receivers = [self.context.bus.subscribe(topic) for topic in skill_topics]
        async with asyncio.TaskGroup() as tg:
            for receiver_ctx in receivers:
                tg.create_task(self._listen(receiver_ctx))
            tg.create_task(self._assignment_listener())

    async def _listen(self, receiver_ctx) -> None:
        async with receiver_ctx as receiver:
            while True:
                message = await receiver()
                job_spec = message.payload["spec"]
                job_id = message.payload["job_id"]
                await self.context.bus.publish(
                    "jobs:claim",
                    {"job_id": job_id, "agent": self.context.name},
                    self.context.name,
                )
                assigned = await self._await_assignment(job_id)
                if assigned:
                    await self._execute(job_spec, job_id)

    async def _execute(self, spec: JobSpec, job_id: str) -> None:
        await asyncio.sleep(max(0.1, self.efficiency))
        subtask_budget = spec.reward_tokens * 0.2
        if subtask_budget > 50:
            sub_spec = JobSpec(
                title=f"Subtask for {spec.title}",
                description="Recursive decomposition by worker agent.",
                required_skills=list(self.context.skills),
                reward_tokens=subtask_budget,
                deadline=datetime.now(timezone.utc) + timedelta(hours=2),
                validation_window=timedelta(minutes=20),
                parent_id=job_id,
                energy_budget=spec.energy_budget * 0.5,
                compute_budget=spec.compute_budget * 0.5,
                metadata={"employer": self.context.name},
            )
            await self.delegate(sub_spec, self.post_job)
        await self.context.bus.publish(
            f"results:{job_id}",
            {
                "job_id": job_id,
                "summary": f"{self.context.name} delivered results for {spec.title}",
                "energy_used": spec.energy_budget * 0.8,
                "compute_used": spec.compute_budget * 0.6,
            },
            self.context.name,
        )

    async def _assignment_listener(self) -> None:
        async with self.context.bus.subscribe("jobs:assignment:*") as receiver:
            while True:
                message = await receiver()
                job_id = message.payload["job_id"]
                agent = message.payload.get("agent")
                if agent != self.context.name:
                    continue
                event = self._assignment_events.get(job_id)
                if event:
                    event.set()

    async def _await_assignment(self, job_id: str) -> bool:
        event = self._assignment_events.setdefault(job_id, asyncio.Event())
        try:
            await asyncio.wait_for(event.wait(), timeout=10)
            return True
        except asyncio.TimeoutError:
            return False
        finally:
            self._assignment_events.pop(job_id, None)


class StrategistAgent(AgentBase):
    """Meta-level agent posting new alpha jobs."""

    def __init__(
        self,
        context: AgentContext,
        post_job: Callable[[JobSpec], asyncio.Future],
        delegation_skills: Optional[List[str]] = None,
    ) -> None:
        super().__init__(context)
        self.post_job = post_job
        self.delegation_skills = delegation_skills or ["general"]

    async def run(self) -> None:
        async with self.context.bus.subscribe("insights") as receiver:
            while True:
                message = await receiver()
                idea = message.payload["idea"]
                spec = JobSpec(
                    title=f"Strategic Initiative: {idea}",
                    description="Strategist decomposes planetary mission into actionable jobs.",
                    required_skills=list(self.delegation_skills),
                    reward_tokens=1_000.0,
                    deadline=datetime.now(timezone.utc) + timedelta(hours=4),
                    validation_window=timedelta(minutes=30),
                    metadata={"employer": self.context.name},
                )
                await self.delegate(spec, self.post_job)


class ValidatorAgent(AgentBase):
    """Validator implementing commit-reveal logic."""

    def __init__(self, context: AgentContext, governance: GovernanceController) -> None:
        super().__init__(context)
        self.governance = governance

    async def run(self) -> None:
        async with self.context.bus.subscribe("results:*") as receiver:
            while True:
                message = await receiver()
                job_id = message.payload["job_id"]
                summary = message.payload["summary"]
                commit = hashlib.sha256(f"{job_id}:{summary}:{self.context.name}".encode()).hexdigest()
                await self.context.bus.publish(
                    f"validation:commit:{job_id}",
                    {"validator": self.context.name, "commit": commit},
                    self.context.name,
                )
                await asyncio.sleep(self.governance.params.validator_commit_window.total_seconds())
                vote = random.random() > 0.1
                await self.context.bus.publish(
                    f"validation:reveal:{job_id}",
                    {"validator": self.context.name, "vote": vote},
                    self.context.name,
                )


async def spawn_agent(name: str, agent: AgentBase) -> asyncio.Task[None]:
    return await agent.start()
