"""Agent definitions for the Supreme Omega demo."""

from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .jobs import Job, JobRegistry, JobSpec, JobStatus
from .messaging import AsyncMessageBus
from .resources import ResourceManager


@dataclass(slots=True)
class AgentContext:
    name: str
    skills: List[str]
    orchestrator: "SupremeOrchestratorProtocol"
    bus: AsyncMessageBus
    resources: ResourceManager
    registry: JobRegistry


class SupremeOrchestratorProtocol:
    async def post_job(self, spec: JobSpec) -> Job:
        raise NotImplementedError

    async def mark_job_complete(self, job_id: str, result_reference: str, energy_used: float, compute_used: float) -> None:
        raise NotImplementedError

    async def request_validation(self, job: Job) -> None:
        raise NotImplementedError


class AgentBase:
    """Base class for Omega-grade agents."""

    def __init__(self, context: AgentContext) -> None:
        self.context = context
        self._running = False

    @property
    def name(self) -> str:
        return self.context.name

    async def start(self) -> None:
        self._running = True
        self.context.bus.register_listener(f"jobs:{self.name}", self._handle_job_notification)
        self.context.bus.register_listener("jobs:*", self._handle_job_notification)
        for skill in self.context.skills:
            self.context.bus.register_listener(
                f"jobs:{skill}", self._handle_job_notification
            )

    async def stop(self) -> None:
        self._running = False

    async def _handle_job_notification(self, topic: str, payload: Dict[str, Any], publisher: str) -> None:
        if not self._running:
            return
        job_id = payload.get("job_id")
        if not job_id:
            return
        job = self.context.registry.get(job_id)
        if not job or job.status != JobStatus.POSTED:
            return
        if not self._can_handle(job):
            return
        await self._execute_job(job)

    def _can_handle(self, job: Job) -> bool:
        if not job.spec.required_skills:
            return True
        return any(skill in self.context.skills for skill in job.spec.required_skills)

    async def delegate(self, spec: JobSpec) -> Job:
        return await self.context.orchestrator.post_job(spec)

    async def _execute_job(self, job: Job) -> None:
        raise NotImplementedError


class StrategistAgent(AgentBase):
    """Agent capable of decomposing missions into sub-jobs."""

    async def _execute_job(self, job: Job) -> None:
        job.mark_started(self.name)
        await asyncio.sleep(random.uniform(0.1, 0.5))
        if job.spec.reward > 2 * self.context.orchestrator.config.default_reward:
            sub_spec = JobSpec(
                title=f"Subtask for {job.spec.title}",
                description="Autonomously decomposed planetary initiative.",
                reward=int(job.spec.reward * 0.5),
                stake_required=int(job.spec.stake_required * 0.5),
                energy_budget=job.spec.energy_budget * 0.5,
                compute_budget=job.spec.compute_budget * 0.5,
                deadline_epoch=job.spec.deadline_epoch,
                parent_id=job.job_id,
                employer=self.name,
                required_skills=["engineering"],
            )
            await self.delegate(sub_spec)
        result_reference = f"strategist://{job.job_id}:{time.time()}"
        await self.context.orchestrator.mark_job_complete(
            job.job_id,
            result_reference,
            energy_used=job.spec.energy_budget * 0.8,
            compute_used=job.spec.compute_budget * 0.9,
        )


class WorkerAgent(AgentBase):
    """Worker agent performing specialized tasks."""

    async def _execute_job(self, job: Job) -> None:
        job.mark_started(self.name)
        await asyncio.sleep(random.uniform(0.2, 0.6))
        result_reference = f"worker://{job.job_id}:{time.time()}"
        await self.context.orchestrator.mark_job_complete(
            job.job_id,
            result_reference,
            energy_used=job.spec.energy_budget * random.uniform(0.4, 0.9),
            compute_used=job.spec.compute_budget * random.uniform(0.4, 0.9),
        )


class ValidatorAgent(AgentBase):
    """Validator participating in commit-reveal rounds."""

    async def start(self) -> None:
        await super().start()
        self.context.bus.register_listener("validation:commit", self._handle_commit_phase)
        self.context.bus.register_listener("validation:reveal", self._handle_reveal_phase)

    async def _execute_job(self, job: Job) -> None:
        return None

    async def _handle_commit_phase(self, topic: str, payload: Dict[str, Any], publisher: str) -> None:
        job_id = payload.get("job_id")
        if not job_id:
            return
        job = self.context.registry.get(job_id)
        if not job or job.status != JobStatus.VALIDATING:
            return
        vote = random.choice([True, True, True, False])
        commitment = {
            "job_id": job_id,
            "validator": self.name,
            "vote_hash": hash((job_id, self.name, vote)) % (1 << 32),
            "revealed": False,
            "vote": vote,
        }
        await self.context.bus.publish("validation:commitment", commitment, self.name)
        await asyncio.sleep(random.uniform(0.05, 0.15))
        await self.context.bus.publish(
            "validation:reveal",
            {"job_id": job_id, "validator": self.name, "vote": vote},
            self.name,
        )

    async def _handle_reveal_phase(self, topic: str, payload: Dict[str, Any], publisher: str) -> None:
        job_id = payload.get("job_id")
        if not job_id:
            return
        vote = bool(payload.get("vote"))
        job = self.context.registry.get(job_id)
        if not job:
            return
        job.validator_votes[self.name] = vote


__all__ = [
    "AgentBase",
    "StrategistAgent",
    "WorkerAgent",
    "ValidatorAgent",
    "AgentContext",
]
