"""Agent definitions for the Omega-grade business demo."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional

from .messaging import MessageBus
from .resources import ResourceManager
from .state import Job

logger = logging.getLogger(__name__)


class Agent:
    """Base class shared by all agents."""

    def __init__(
        self,
        name: str,
        skills: Iterable[str],
        orchestrator: "OrchestratorProtocol",
        bus: MessageBus,
        resources: ResourceManager,
    ) -> None:
        self.name = name
        self.skills = set(skills)
        self._orchestrator = orchestrator
        self._bus = bus
        self._resources = resources
        self._subscriptions: Dict[str, asyncio.Queue] = {}
        self._tasks: List[asyncio.Task] = []
        self._running = False

    # ----------------------------------------------------------------- lifecycle
    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        for topic in self.subscription_topics():
            queue = await self._bus.subscribe(topic)
            self._subscriptions[topic] = queue
            self._tasks.append(asyncio.create_task(self._consume(topic, queue)))
        logger.info("agent_started", extra={"agent": self.name})

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        self._subscriptions.clear()

    async def _consume(self, topic: str, queue: asyncio.Queue) -> None:
        while self._running:
            payload = await queue.get()
            try:
                await self.handle_message(topic, payload)
            except Exception as exc:  # pragma: no cover - defensive
                logger.exception("agent_message_error", extra={"agent": self.name, "topic": topic})

    # ----------------------------------------------------------------- behaviour
    def subscription_topics(self) -> Iterable[str]:
        return []

    async def handle_message(self, topic: str, payload: Mapping[str, Any]) -> None:
        if payload.get("type") == "job_posted":
            await self._consider_job(payload)

    async def _consider_job(self, payload: Mapping[str, Any]) -> None:
        job_id = str(payload["job_id"])
        spec = payload.get("spec", {})
        required_skills = set(spec.get("skills", []))
        if not required_skills & self.skills:
            return
        await self._orchestrator.apply_for_job(job_id, self)

    async def execute_job(self, job: Job) -> Mapping[str, Any]:  # pragma: no cover - overridden
        raise NotImplementedError

    async def delegate(self, *, spec: MutableMapping[str, Any], reward: Optional[float] = None) -> str:
        return await self._orchestrator.delegate_job(self, spec=spec, reward=reward)


class FinanceAgent(Agent):
    def subscription_topics(self) -> Iterable[str]:
        return ["jobs:finance"]

    async def execute_job(self, job: Job) -> Mapping[str, Any]:
        compute_required = float(job.spec.get("compute", 1.0))
        await asyncio.sleep(0.01)
        projection = compute_required * 3.1415
        result = {"analysis": f"Projected ROI {projection:.2f}", "projection": projection}
        if job.spec.get("spawn_supply_chain"):
            await self.delegate(
                spec={"skills": ["supply_chain"], "description": "Plan logistics corridor", "parent": job.job_id},
                reward=job.reward * 0.5,
            )
        return result


class EnergyAgent(Agent):
    def subscription_topics(self) -> Iterable[str]:
        return ["jobs:energy"]

    async def execute_job(self, job: Job) -> Mapping[str, Any]:
        await asyncio.sleep(0.01)
        expansion = float(job.spec.get("expansion_gw", 10.0))
        return {
            "action": "build_solar",
            "magnitude": expansion,
            "description": f"Deployed {expansion}GW orbital array",
        }


class SupplyChainAgent(Agent):
    def subscription_topics(self) -> Iterable[str]:
        return ["jobs:supply_chain"]

    async def execute_job(self, job: Job) -> Mapping[str, Any]:
        await asyncio.sleep(0.01)
        return {
            "summary": "Global distribution realigned",
            "carbon_impact": -2.5,
            "efficiency_gain": 0.12,
        }


class ValidatorAgent(Agent):
    def subscription_topics(self) -> Iterable[str]:
        return ["validation:commit", "validation:reveal"]

    async def handle_message(self, topic: str, payload: Mapping[str, Any]) -> None:
        job_id = str(payload["job_id"])
        if topic == "validation:commit":
            await self._orchestrator.receive_commit(job_id, self, payload["result_digest"])
        elif topic == "validation:reveal":
            verdict = await self.generate_verdict(payload)
            await self._orchestrator.receive_reveal(job_id, self, verdict)

    async def generate_verdict(self, payload: Mapping[str, Any]) -> bool:
        await asyncio.sleep(0.005)
        return bool(payload.get("suggested_verdict", True))

    async def execute_job(self, job: Job) -> Mapping[str, Any]:  # pragma: no cover - validators do not execute jobs
        return {}


class OrchestratorProtocol:  # pragma: no cover - for type checking only
    async def apply_for_job(self, job_id: str, agent: Agent) -> None: ...

    async def delegate_job(self, agent: Agent, *, spec: MutableMapping[str, Any], reward: Optional[float]) -> str: ...

    async def receive_commit(self, job_id: str, agent: Agent, digest: str) -> None: ...

    async def receive_reveal(self, job_id: str, agent: Agent, verdict: bool) -> None: ...
