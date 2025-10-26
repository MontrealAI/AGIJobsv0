from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Sequence, TYPE_CHECKING

from .job import Job
from .logging import log_structured
from .resources import ResourceManager

if TYPE_CHECKING:
    from .orchestrator import OmegaOrchestrator


@dataclass
class AgentContext:
    orchestrator: "OmegaOrchestrator"
    agent: "AgentBase"

    async def delegate(self, spec: Dict[str, float], *, deadline_hours: float = 4.0, parent: Job | None = None) -> Job:
        return await self.orchestrator.delegate_job(self.agent, spec, deadline_hours, parent_job=parent)

    def broadcast(self, topic: str, payload: Dict[str, float]) -> None:
        self.orchestrator.bus.publish(topic, payload)


class AgentBase:
    def __init__(self, name: str, skills: Sequence[str], orchestrator: "OmegaOrchestrator", resource_manager: ResourceManager) -> None:
        self.name = name
        self.skills = set(skills)
        self.orchestrator = orchestrator
        self.resource_manager = resource_manager
        self.context = AgentContext(orchestrator=orchestrator, agent=self)
        self._tasks: list[asyncio.Task[None]] = []
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        if self._tasks:
            return
        for skill in self.skills:
            self._tasks.append(asyncio.create_task(self._consume_topic(f"jobs:{skill}")))
        self._tasks.append(asyncio.create_task(self._consume_topic("jobs:*")))

    async def stop(self) -> None:
        self._stop_event.set()
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._tasks.clear()

    async def _consume_topic(self, topic: str) -> None:
        queue = self.orchestrator.bus.subscribe(topic)
        while not self._stop_event.is_set():
            try:
                message = await asyncio.wait_for(queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            job_id = message.payload["job_id"]
            job = self.orchestrator.registry.get(job_id)
            if self._should_accept(job):
                await self.orchestrator.assign_job(job, self)

    def _should_accept(self, job: Job) -> bool:
        if job.assigned_agent:
            return False
        return bool(self.skills.intersection(job.skills))

    async def handle_job(self, job: Job) -> Dict[str, float]:
        seed = int(job.reward + job.energy_budget + job.compute_budget)
        rnd = random.Random(seed)
        energy = min(job.energy_budget, rnd.uniform(0.2, 0.5) * job.energy_budget)
        compute = min(job.compute_budget, rnd.uniform(0.2, 0.6) * job.compute_budget)
        price_energy, price_compute = self.resource_manager.request_allocation(self.name, energy, compute)
        log_structured(
            self.orchestrator.logger,
            "agent_allocation",
            agent=self.name,
            job_id=job.job_id,
            energy=energy,
            compute=compute,
            price_energy=price_energy,
            price_compute=price_compute,
        )
        await asyncio.sleep(rnd.uniform(0.05, 0.12))
        job.energy_used += energy
        job.compute_used += compute
        action = {
            "energy_delta": energy * 0.1,
            "compute_delta": compute * 0.05,
            "innovation_delta": rnd.uniform(0.0, 0.02),
        }
        if self.orchestrator.simulation:
            snapshot = self.orchestrator.simulation.apply_action(action)
            log_structured(self.orchestrator.logger, "simulation_update", agent=self.name, job_id=job.job_id, **snapshot)
        if rnd.random() > 0.65 and len(job.skills) > 1:
            sub_spec = {
                "title": f"{job.title} :: Delegated",
                "reward": job.reward * 0.25,
                "energy_budget": job.energy_budget * 0.5,
                "compute_budget": job.compute_budget * 0.4,
                "description": f"Nested objective stemming from {job.title}",
                "skills": list(job.skills)[1:],
            }
            sub_job = await self.context.delegate(sub_spec, deadline_hours=job.deadline.hour % 6 + 3, parent=job)
            log_structured(self.orchestrator.logger, "delegated_job", parent=job.job_id, child=sub_job.job_id, agent=self.name)
        self.resource_manager.release_allocation(self.name, energy, compute)
        result = {
            "agent": self.name,
            "delivered_at": datetime.now(timezone.utc).isoformat(),
            "insights": f"{job.title} resolved with agent {self.name}",
            "energy_used": energy,
            "compute_used": compute,
        }
        return result


class StrategyAgent(AgentBase):
    pass


class EnergyAgent(AgentBase):
    pass


class FinanceAgent(AgentBase):
    pass


class ValidatorAgent(AgentBase):
    async def validate(self, job: Job, result: Dict[str, float]) -> tuple[str, str]:
        salt = f"{self.name}:{job.job_id}"
        verdict = "approve" if result.get("energy_used", 0.0) <= job.energy_budget else "reject"
        job.record_commitment(self.name, verdict, salt)
        await asyncio.sleep(0.01)
        job.reveal(self.name, verdict, salt)
        return verdict, salt
