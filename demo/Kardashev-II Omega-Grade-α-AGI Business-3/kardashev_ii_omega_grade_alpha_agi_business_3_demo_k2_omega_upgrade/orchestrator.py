"""Omega-grade orchestrator capable of multi-hour autonomous operation."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from .agents import AgentBase, AgentContext, ValidatorAgent, WorkerAgent
from .bus import MessageBus
from .jobs import JobRecord, JobRegistry, JobSpec, JobStatus
from .resources import ResourceCaps, ResourceManager
from .simulation import PlanetarySim, SyntheticEconomySim

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class OrchestratorConfig:
    mission_name: str
    operator_account: str
    base_agent_tokens: float
    energy_capacity: float
    compute_capacity: float
    validator_names: List[str]
    worker_definitions: List[Dict[str, Any]]
    checkpoint_dir: Path
    status_output_path: Path
    governance_params: Dict[str, Any]
    simulation_params: Dict[str, Any]


class Orchestrator:
    """Coordinates agents, jobs and governance for the demo."""

    def __init__(self, config: OrchestratorConfig) -> None:
        self.config = config
        self.registry = JobRegistry()
        self.bus = MessageBus()
        caps = ResourceCaps(config.energy_capacity, config.compute_capacity)
        self.resource_manager = ResourceManager(caps)
        self.resource_manager.ensure_balance(config.operator_account, config.base_agent_tokens)
        self.resource_manager.ensure_balance("treasury", config.base_agent_tokens)
        self.agents: List[AgentBase] = []
        self.validators: List[ValidatorAgent] = []
        self._tasks: List[asyncio.Task] = []
        self._running = False
        self._pause_event = asyncio.Event()
        self._pause_event.set()
        self.simulation: PlanetarySim | None = None
        self.status_output_path = config.status_output_path
        self.status_output_path.parent.mkdir(parents=True, exist_ok=True)
        self.checkpoint_dir = config.checkpoint_dir
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self._monitored_jobs: set[str] = set()

    async def start(self) -> None:
        logging.basicConfig(level=logging.INFO)
        self._running = True
        self._load_simulation()
        await self._restore_state()
        await self._spawn_agents()
        self._tasks.append(asyncio.create_task(self._job_scheduler_loop()))
        self._tasks.append(asyncio.create_task(self._checkpoint_loop()))
        self._tasks.append(asyncio.create_task(self._governance_loop()))
        logger.info("Orchestrator started")

    async def shutdown(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        for agent in self.agents + self.validators:
            try:
                await agent.stop()
            except Exception as exc:  # pragma: no cover
                logger.exception("Error stopping agent %s: %s", agent.context.name, exc)
        await self._persist_state()
        logger.info("Orchestrator shut down")

    async def pause(self) -> None:
        logger.info("Pausing orchestrator")
        self._pause_event.clear()
        for agent in self.agents:
            await agent.pause()

    async def resume(self) -> None:
        logger.info("Resuming orchestrator")
        self._pause_event.set()
        for agent in self.agents:
            await agent.resume()

    async def create_job(self, spec: JobSpec) -> str:
        await self._pause_event.wait()
        record = self.registry.create(spec)
        logger.info("Created job %s: %s", record.job_id, spec.title)
        await self.bus.publish(
            f"jobs:{spec.metadata.get('skill', 'general')}",
            {"event": "job_posted", "job_id": record.job_id, "spec": spec.title},
        )
        await self.bus.publish(
            f"jobs:{record.job_id}:status",
            {"event": "created", "job_id": record.job_id, "title": spec.title},
        )
        await self._schedule_deadline(record)
        self._register_job_monitors(record.job_id)
        return record.job_id

    async def submit_job_result(self, agent: str, job_id: str, payload: Dict[str, Any]) -> None:
        record = self.registry.get(job_id)
        record.status = JobStatus.AWAITING_VALIDATION
        await self.bus.publish("jobs:validation", {"job_id": job_id, "payload": payload, "reveal_delay": 1.0})
        await self.bus.publish(f"jobs:{job_id}:status", {"event": "result_submitted", "agent": agent, "payload": payload})

    async def _spawn_agents(self) -> None:
        for worker in self.config.worker_definitions:
            skills = tuple(worker.get("skills", [worker["name"], "general"]))
            context = AgentContext(
                name=worker["name"],
                skills=skills,
                stake_ratio=float(worker.get("stake_ratio", 1.0)),
                efficiency=float(worker.get("efficiency", 1.0)),
            )
            agent = WorkerAgent(context, bus=self.bus, orchestrator=self, resource_manager=self.resource_manager)
            self.agents.append(agent)
            await agent.start()
        for validator_name in self.config.validator_names:
            context = AgentContext(name=validator_name, skills=("validator",), stake_ratio=0.5, efficiency=1.0)
            validator = ValidatorAgent(context, bus=self.bus, orchestrator=self, resource_manager=self.resource_manager)
            self.validators.append(validator)
            await validator.start()

    async def _job_scheduler_loop(self) -> None:
        while self._running:
            await self._pause_event.wait()
            await asyncio.sleep(0.5)
            for job in self.registry.jobs():
                if job.status == JobStatus.PENDING:
                    await self.bus.publish(
                        f"jobs:{job.spec.metadata.get('skill', 'general')}",
                        {"event": "job_pending", "job_id": job.job_id},
                    )
            await self._emit_status()

    async def _checkpoint_loop(self) -> None:
        while self._running:
            await asyncio.sleep(5)
            await self._persist_state()

    async def _governance_loop(self) -> None:
        quorum = self.config.governance_params.get("validator_quorum", 0.6)
        async for message in self.bus.subscribe("jobs:governance"):
            proposal = message.get("proposal")
            votes = message.get("votes", [])
            if votes and len(votes) / len(self.validators) >= quorum:
                for key, value in proposal.items():
                    self.config.governance_params[key] = value
                    logger.info("Governance update %s -> %s", key, value)

    async def _schedule_deadline(self, record: JobRecord) -> None:
        async def _deadline_watchdog() -> None:
            await asyncio.sleep(record.spec.deadline_s)
            if record.status not in {JobStatus.COMPLETED, JobStatus.CANCELLED}:
                record.status = JobStatus.FAILED
                await self.bus.publish(
                    f"jobs:{record.job_id}:status", {"event": "deadline_missed", "job_id": record.job_id}
                )
        self._tasks.append(asyncio.create_task(_deadline_watchdog()))

    def _register_job_monitors(self, job_id: str) -> None:
        if job_id in self._monitored_jobs:
            return
        self._monitored_jobs.add(job_id)
        self._tasks.append(asyncio.create_task(self._collect_commits(job_id)))
        self._tasks.append(asyncio.create_task(self._collect_reveals(job_id)))

    async def _collect_commits(self, job_id: str) -> None:
        async for message in self.bus.subscribe(f"jobs:{job_id}:commit"):
            validator = message.get("validator")
            commit = message.get("commit")
            if not validator or not commit:
                continue
            record = self.registry.get(job_id)
            record.validator_commits[validator] = commit

    async def _collect_reveals(self, job_id: str) -> None:
        quorum_ratio = self.config.governance_params.get("validator_quorum", 0.6)
        approval_threshold = self.config.governance_params.get("validation_threshold", 0.51)
        required_votes = max(1, int(len(self.validators) * quorum_ratio))
        async for message in self.bus.subscribe(f"jobs:{job_id}:reveal"):
            validator = message.get("validator")
            if not validator:
                continue
            decision = bool(message.get("decision", False))
            record = self.registry.get(job_id)
            record.validator_reveals[validator] = decision
            if len(record.validator_reveals) >= required_votes:
                approvals = sum(1 for vote in record.validator_reveals.values() if vote)
                ratio = approvals / max(len(record.validator_reveals), 1)
                if ratio >= approval_threshold:
                    await self._finalize_job_success(record)
                else:
                    await self._finalize_job_failure(record)
                break

    async def _restore_state(self) -> None:
        resource_path = self.resource_manager.checkpoint_path(self.checkpoint_dir)
        self.resource_manager.restore(resource_path)
        jobs_path = self.checkpoint_dir / "jobs.json"
        if jobs_path.exists():
            payload = json.loads(jobs_path.read_text(encoding="utf-8"))
            for data in payload.values():
                spec = JobSpec(
                    title=data["title"],
                    description=data["description"],
                    reward_tokens=data["reward_tokens"],
                    stake_required=data["stake_required"],
                    energy_budget=data["energy_budget"],
                    compute_budget=data["compute_budget"],
                    deadline_s=data["deadline_s"],
                    parent_id=data.get("parent_id"),
                    employer=data.get("employer"),
                    skills=data.get("skills", []),
                    metadata=data.get("metadata", {}),
                )
                record = self.registry.create(spec, job_id=data["job_id"])
                record.status = JobStatus(data["status"])
                record.assigned_agent = data.get("assigned_agent")
                record.energy_used = data.get("energy_used", 0.0)
                record.compute_used = data.get("compute_used", 0.0)
                record.stake_locked = data.get("stake_locked", 0.0)
                record.validator_commits = data.get("validator_commits", {})
                record.validator_reveals = data.get("validator_reveals", {})
                record.children = list(data.get("children", []))
            for record in self.registry.jobs():
                if record.spec.parent_id:
                    try:
                        parent = self.registry.get(record.spec.parent_id)
                    except KeyError:
                        continue
                    if record.job_id not in parent.children:
                        parent.children.append(record.job_id)
                if record.status in {JobStatus.PENDING, JobStatus.ACTIVE, JobStatus.AWAITING_VALIDATION}:
                    self._register_job_monitors(record.job_id)

    async def _persist_state(self) -> None:
        resource_path = self.resource_manager.checkpoint_path(self.checkpoint_dir)
        self.resource_manager.persist(resource_path)
        jobs_path = self.checkpoint_dir / "jobs.json"
        jobs_path.write_text(json.dumps(self.registry.to_dict(), indent=2), encoding="utf-8")

    async def _finalize_job_success(self, record: JobRecord) -> None:
        record.status = JobStatus.COMPLETED
        reward = record.spec.reward_tokens
        stake = record.stake_locked
        if record.assigned_agent:
            self.resource_manager.ensure_balance(record.assigned_agent, 0.0)
            self.resource_manager.reward(record.assigned_agent, reward + stake)
        validator_reward_ratio = self.config.governance_params.get("validator_reward_ratio", 0.05)
        validator_reward_pool = reward * validator_reward_ratio
        winners = [name for name, decision in record.validator_reveals.items() if decision]
        if winners:
            share = validator_reward_pool / len(winners)
            for validator in winners:
                self.resource_manager.ensure_balance(validator, 0.0)
                self.resource_manager.reward(validator, share)
        record.stake_locked = 0.0
        self._monitored_jobs.discard(record.job_id)
        await self.bus.publish(
            f"jobs:{record.job_id}:status",
            {"event": "finalized", "job_id": record.job_id, "status": JobStatus.COMPLETED.value},
        )
        await self._propagate_completion(record)

    async def _finalize_job_failure(self, record: JobRecord) -> None:
        record.status = JobStatus.FAILED
        penalty = record.stake_locked
        if penalty > 0:
            self.resource_manager.ensure_balance(self.config.operator_account, 0.0)
            self.resource_manager.reward(self.config.operator_account, penalty)
        record.stake_locked = 0.0
        self._monitored_jobs.discard(record.job_id)
        await self.bus.publish(
            f"jobs:{record.job_id}:status",
            {"event": "finalized", "job_id": record.job_id, "status": JobStatus.FAILED.value},
        )

    async def _propagate_completion(self, record: JobRecord) -> None:
        parent_id = record.spec.parent_id
        if not parent_id:
            return
        try:
            parent = self.registry.get(parent_id)
        except KeyError:
            return
        if all(self.registry.get(child).status == JobStatus.COMPLETED for child in parent.children):
            parent.status = JobStatus.COMPLETED
            await self.bus.publish(
                f"jobs:{parent.job_id}:status",
                {"event": "completed", "job_id": parent.job_id, "status": JobStatus.COMPLETED.value},
            )
            await self._propagate_completion(parent)

    async def _emit_status(self) -> None:
        snapshot = {
            "mission": self.config.mission_name,
            "resources": {
                "energy_available": self.resource_manager.energy_available,
                "compute_available": self.resource_manager.compute_available,
                "conversion_rate": self.resource_manager.dynamic_conversion_rate,
            },
            "ledger": self.resource_manager.ledger.snapshot(),
            "jobs": [job.to_dict() for job in self.registry.jobs()],
        }
        with self.status_output_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(snapshot) + "\n")

    def _load_simulation(self) -> None:
        if not self.config.simulation_params:
            return
        if self.config.simulation_params.get("type") == "synthetic_economy":
            self.simulation = SyntheticEconomySim.from_config(self.config.simulation_params)
        else:
            self.simulation = None

    async def inject_simulation_action(self, action: Dict[str, Any]) -> None:
        if not self.simulation:
            return
        result = self.simulation.apply_action(action)
        await self.bus.publish("simulation:events", {"action": action, "result": result})

