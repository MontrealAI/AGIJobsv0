"""Agent implementations for the Omega-grade demo."""

from __future__ import annotations

import asyncio
import hashlib
import random
from dataclasses import dataclass
from typing import Any, Dict, Iterable

from .bus import MessageBus
from .jobs import JobRecord, JobSpec, JobStatus
from .resources import ResourceManager


@dataclass(slots=True)
class AgentContext:
    name: str
    skills: tuple[str, ...]
    stake_ratio: float
    efficiency: float


class AgentBase:
    """Base class providing delegation and messaging helpers."""

    def __init__(self, context: AgentContext, *, bus: MessageBus, orchestrator: "OrchestratorProtocol", resource_manager: ResourceManager) -> None:
        self.context = context
        self.bus = bus
        self.orchestrator = orchestrator
        self.resource_manager = resource_manager
        self._subscriptions: list[asyncio.Task] = []
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        for topic in self._topics():
            self._subscriptions.append(asyncio.create_task(self._run_loop(topic)))

    async def stop(self) -> None:
        self._running = False
        for task in self._subscriptions:
            task.cancel()
        if self._subscriptions:
            await asyncio.gather(*self._subscriptions, return_exceptions=True)
        self._subscriptions.clear()

    def _topics(self) -> Iterable[str]:
        yield f"jobs:{self.context.name}"
        for skill in self.context.skills:
            yield f"jobs:{skill}"

    async def _run_loop(self, topic: str) -> None:
        async for message in self.bus.subscribe(topic):
            if not self._running:
                break
            await self._handle_job_message(message)

    async def _handle_job_message(self, message: Dict[str, Any]) -> None:
        job_id = message.get("job_id")
        if not job_id:
            return
        record = self.orchestrator.registry.get(job_id)
        if record.status not in {JobStatus.PENDING, JobStatus.ACTIVE}:
            return
        await self.accept_job(record)

    async def accept_job(self, record: JobRecord) -> None:
        raise NotImplementedError

    async def delegate(self, *, spec: JobSpec) -> str:
        spec.employer = self.context.name
        return await self.orchestrator.create_job(spec)

    async def submit_result(self, job_id: str, payload: Dict[str, Any]) -> None:
        await self.orchestrator.submit_job_result(self.context.name, job_id, payload)

    async def pause(self) -> None:
        self._running = False

    async def resume(self) -> None:
        if self._running:
            return
        await self.start()


class WorkerAgent(AgentBase):
    """Simple worker agent that performs deterministic pseudo-work."""

    async def accept_job(self, record: JobRecord) -> None:
        if not set(record.spec.skills).intersection(self.context.skills):
            return
        if record.assigned_agent and record.assigned_agent != self.context.name:
            return
        required_stake = record.spec.stake_required * self.context.stake_ratio
        self.resource_manager.ensure_balance(self.context.name, required_stake * 2)
        self.resource_manager.stake(self.context.name, required_stake)
        record.stake_locked += required_stake
        record.assigned_agent = self.context.name
        record.status = JobStatus.ACTIVE
        await self.bus.publish(
            f"jobs:{record.job_id}:status",
            {"agent": self.context.name, "event": "accepted", "stake": required_stake},
        )
        await self._execute_job(record)

    async def _execute_job(self, record: JobRecord) -> None:
        pseudo_duration = max(0.1, record.spec.compute_budget / (1000 * self.context.efficiency))
        energy_cost = record.spec.energy_budget * 0.8
        compute_cost = record.spec.compute_budget * 0.8
        await asyncio.sleep(pseudo_duration)
        try:
            self.resource_manager.consume(agent=self.context.name, energy=energy_cost, compute=compute_cost)
        except ValueError as exc:
            await self.bus.publish(f"jobs:{record.job_id}:status", {"agent": self.context.name, "event": "resource_error", "error": str(exc)})
            record.status = JobStatus.FAILED
            if record.stake_locked:
                self.resource_manager.ensure_balance(self.orchestrator.config.operator_account, 0.0)
                self.resource_manager.reward(self.orchestrator.config.operator_account, record.stake_locked)
                record.stake_locked = 0.0
            return
        record.energy_used += energy_cost
        record.compute_used += compute_cost
        payload = {
            "job_id": record.job_id,
            "agent": self.context.name,
            "summary": f"Completed job {record.spec.title}",
            "energy_used": energy_cost,
            "compute_used": compute_cost,
        }
        await self.submit_result(record.job_id, payload)


class ValidatorAgent(AgentBase):
    """Validator using a commit/reveal process."""

    def __init__(self, context: AgentContext, *, bus: MessageBus, orchestrator: "OrchestratorProtocol", resource_manager: ResourceManager) -> None:
        super().__init__(context, bus=bus, orchestrator=orchestrator, resource_manager=resource_manager)
        self._subscriptions: list[asyncio.Task] = []

    async def start(self) -> None:
        self._running = True
        self._subscriptions.append(asyncio.create_task(self._listen_for_commits()))

    async def stop(self) -> None:
        self._running = False
        for task in self._subscriptions:
            task.cancel()
        if self._subscriptions:
            await asyncio.gather(*self._subscriptions, return_exceptions=True)
        self._subscriptions.clear()

    async def _listen_for_commits(self) -> None:
        async for message in self.bus.subscribe("jobs:validation"):
            if not self._running:
                break
            await self._handle_validation_message(message)

    async def _handle_validation_message(self, message: Dict[str, Any]) -> None:
        job_id = message.get("job_id")
        if not job_id:
            return
        decision = self._compute_decision(job_id, message.get("payload"))
        commit = hashlib.sha256(f"{job_id}:{decision}".encode()).hexdigest()
        await self.bus.publish(
            f"jobs:{job_id}:commit",
            {"validator": self.context.name, "commit": commit, "job_id": job_id},
        )
        await asyncio.sleep(message.get("reveal_delay", 1.0))
        await self.bus.publish(
            f"jobs:{job_id}:reveal",
            {"validator": self.context.name, "job_id": job_id, "decision": decision},
        )

    def _compute_decision(self, job_id: str, payload: Dict[str, Any] | None) -> bool:
        if payload and payload.get("energy_used") is not None:
            signal = float(payload["energy_used"]) + float(payload.get("compute_used", 0.0))
            threshold = random.random() * 100
            return signal <= threshold
        return random.random() > 0.1

    async def accept_job(self, record: JobRecord) -> None:  # pragma: no cover - validators don't accept worker jobs
        return


class OrchestratorProtocol:
    registry: Any
    config: Any

    async def create_job(self, spec: JobSpec) -> str:  # pragma: no cover - interface definition only
        raise NotImplementedError

    async def submit_job_result(self, agent: str, job_id: str, payload: Dict[str, Any]) -> None:  # pragma: no cover
        raise NotImplementedError

