"""Supreme Omega-grade orchestrator implementation."""

from __future__ import annotations

import asyncio
import contextlib
import importlib
import json
import random
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from .agents import AgentContext, StrategistAgent, SupremeOrchestratorProtocol, ValidatorAgent, WorkerAgent
from .config import SupremeDemoConfig
from .jobs import Job, JobRegistry, JobSpec, JobStatus
from .messaging import AsyncMessageBus
from .persistence import StatePersistence
from .resources import ResourceManager
from .simulation import PlanetarySim, SyntheticEconomySim


class SupremeOrchestrator(SupremeOrchestratorProtocol):
    """Coordinates agents, resources, and validators for Omega-grade missions."""

    def __init__(self, config: SupremeDemoConfig) -> None:
        self.config = config
        self.bus = AsyncMessageBus(config.bus_history_path)
        self.registry = JobRegistry()
        self.resources = ResourceManager(
            energy_reserve=config.energy_reserve,
            compute_reserve=config.compute_reserve,
            token_supply=config.token_supply,
            snapshot_path=config.structured_metrics_path,
        )
        self.persistence = StatePersistence(config.checkpoint_path)
        self.simulation: Optional[PlanetarySim] = (
            SyntheticEconomySim(log_path=Path("./omega_simulation_log.jsonl"))
            if config.enable_simulation
            else None
        )
        self._simulation_plugins: List[PlanetarySim] = []
        self._load_simulation_plugins(config.simulation_plugins)
        self._structured_log_lock = asyncio.Lock()
        self._job_history_lock = asyncio.Lock()
        self._running = False
        self._paused = config.paused
        self._emergency_stop = config.emergency_stop
        self._tasks: List[asyncio.Task] = []
        self._owner_task: Optional[asyncio.Task] = None
        self._checkpoint_task: Optional[asyncio.Task] = None
        self._cycle_task: Optional[asyncio.Task] = None
        self._simulation_task: Optional[asyncio.Task] = None
        self._validation_tasks: List[asyncio.Task] = []
        self._validators: List[ValidatorAgent] = []
        self._agents: List[WorkerAgent] = []
        self._strategists: List[StrategistAgent] = []
        self._metadata: Dict[str, Any] = {
            "cycles": 0,
            "last_snapshot": None,
            "mission": self.config.name,
            "description": self.config.description,
        }
        self.config.ensure_directories()
        self._log_path = self.config.log_path
        self._log_path.parent.mkdir(parents=True, exist_ok=True)
        self._job_history_path = Path(self.config.job_history_path)
        self._job_history_path.parent.mkdir(parents=True, exist_ok=True)

    async def run(self) -> None:
        self._hydrate_state()
        self._running = True
        await self._log_event("orchestrator.start", {"config": self._config_summary()})
        await self._start_agents()
        self._cycle_task = asyncio.create_task(self._cycle_loop(), name="supreme-cycles")
        self._checkpoint_task = asyncio.create_task(
            self._checkpoint_loop(), name="supreme-checkpoint"
        )
        self._owner_task = asyncio.create_task(
            self._owner_command_loop(), name="supreme-owner-loop"
        )
        self._simulation_task = asyncio.create_task(
            self._simulation_loop(), name="supreme-simulation"
        )
        await self._bootstrap_mission()
        await asyncio.wait(
            [self._cycle_task, self._checkpoint_task, self._owner_task, self._simulation_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        await self.stop()

    async def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        await self._log_event("orchestrator.stop", {"cycles": self._metadata["cycles"]})
        for task in [self._cycle_task, self._checkpoint_task, self._owner_task, self._simulation_task]:
            if task:
                task.cancel()
        for task in self._validation_tasks:
            task.cancel()
        await asyncio.gather(
            *(agent.stop() for agent in (*self._agents, *self._strategists, *self._validators)),
            return_exceptions=True,
        )
        self._save_state()

    async def post_job(self, spec: JobSpec) -> Job:
        stake_required = spec.stake_required or int(spec.reward * self.config.default_stake_ratio)
        spec.stake_required = stake_required
        employer_account = self.resources.ensure_account(spec.employer)
        employer_account.stake(stake_required)
        job = self.registry.create_job(spec)
        await self._log_event(
            "job.posted",
            {
                "job_id": job.job_id,
                "title": job.spec.title,
                "reward": job.spec.reward,
                "stake": job.spec.stake_required,
                "employer": job.spec.employer,
                "parent": job.spec.parent_id,
            },
        )
        payload = {"job_id": job.job_id, "spec": asdict(job.spec)}
        await self.bus.publish("jobs:global", payload, "orchestrator")
        for skill in job.spec.required_skills:
            await self.bus.publish(f"jobs:{skill}", payload, "orchestrator")
        await self._append_job_history(
            {
                "event": "posted",
                "job_id": job.job_id,
                "title": job.spec.title,
                "parent": job.spec.parent_id,
                "employer": job.spec.employer,
                "reward": job.spec.reward,
                "stake": job.spec.stake_required,
            }
        )
        await self._refresh_mermaid_dashboard()
        return job

    async def mark_job_complete(
        self,
        job_id: str,
        result_reference: str,
        energy_used: float,
        compute_used: float,
    ) -> None:
        job = self.registry.get(job_id)
        if not job:
            raise ValueError(f"Unknown job {job_id}")
        job.mark_validating()
        job.result_reference = result_reference
        job.energy_used = energy_used
        job.compute_used = compute_used
        if job.worker:
            try:
                self.resources.allocate_resources(job.worker, energy_used, compute_used)
                cost = self.resources.charge_for_resources(job.worker, energy_used, compute_used)
            except ValueError as exc:  # pragma: no cover - defensive guard
                cost = 0.0
                await self._log_event(
                    "job.resource_constraint",
                    {
                        "job_id": job_id,
                        "worker": job.worker,
                        "error": str(exc),
                    },
                )
        else:
            cost = 0.0
        await self._log_event(
            "job.submitted",
            {
                "job_id": job_id,
                "worker": job.worker,
                "result": result_reference,
                "energy_used": energy_used,
                "compute_used": compute_used,
                "cost": cost,
            },
        )
        await self.bus.publish(
            f"results:{job_id}",
            {
                "job_id": job_id,
                "result_reference": result_reference,
                "energy_used": energy_used,
                "compute_used": compute_used,
            },
            job.worker or "unknown",
        )
        validation_task = asyncio.create_task(self._run_validation(job), name=f"validation-{job_id}")
        self._track_validation_task(validation_task, job_id)

    async def request_validation(self, job: Job) -> None:
        await self.bus.publish("validation:commit", {"job_id": job.job_id}, "orchestrator")

    async def _run_validation(self, job: Job) -> None:
        await self.request_validation(job)
        await asyncio.sleep(self.config.validator_commit_delay_seconds)
        await asyncio.sleep(self.config.validator_reveal_delay_seconds)
        approvals = sum(1 for vote in job.validator_votes.values() if vote)
        threshold = max(1, int(self.config.validators * 0.5) + 1)
        if approvals >= threshold:
            job.mark_complete(job.result_reference or "")
            reward = job.spec.reward
            self.resources.reward(job.worker or "unknown", reward)
            employer = job.spec.employer
            stake_released = self.resources.release_stake(employer, job.spec.stake_required)
            for validator, vote in job.validator_votes.items():
                if vote:
                    self.resources.reward(validator, reward * 0.05)
                else:
                    self.resources.slash(validator, reward * 0.02)
            await self._log_event(
                "job.completed",
                {
                    "job_id": job.job_id,
                    "worker": job.worker,
                    "reward": reward,
                    "employer": employer,
                    "stake_released": stake_released,
                    "approvals": approvals,
                    "validators": len(job.validator_votes),
                },
            )
            await self._append_job_history(
                {
                    "event": "completed",
                    "job_id": job.job_id,
                    "worker": job.worker,
                    "reward": reward,
                    "employer": employer,
                    "stake_released": stake_released,
                    "approvals": approvals,
                }
            )
            await self._refresh_mermaid_dashboard()
        else:
            job.mark_failed("validator_rejection")
            employer = job.spec.employer
            penalty = self.resources.slash(employer, job.spec.stake_required)
            await self._log_event(
                "job.failed",
                {
                    "job_id": job.job_id,
                    "worker": job.worker,
                    "employer": employer,
                    "penalty": penalty,
                    "approvals": approvals,
                },
            )
            await self._append_job_history(
                {
                    "event": "failed",
                    "job_id": job.job_id,
                    "worker": job.worker,
                    "employer": employer,
                    "penalty": penalty,
                    "approvals": approvals,
                }
            )
            await self._refresh_mermaid_dashboard()

    def _track_validation_task(self, task: asyncio.Task, job_id: str) -> None:
        """Track validation tasks and eagerly prune them once finished."""

        self._validation_tasks.append(task)

        def _cleanup(completed: asyncio.Future) -> None:
            with contextlib.suppress(ValueError):
                self._validation_tasks.remove(completed)
            if completed.cancelled():
                return
            exc = completed.exception()
            if exc:
                asyncio.get_event_loop().call_exception_handler(
                    {
                        "message": "validation task failed",
                        "exception": exc,
                        "job_id": job_id,
                    }
                )

        task.add_done_callback(_cleanup)

    async def _cycle_loop(self) -> None:
        target_cycles = self.config.cycles
        while self._running:
            if self._emergency_stop:
                await self._log_event("orchestrator.emergency_stop", {})
                break
            if self._paused:
                await asyncio.sleep(1)
                continue
            self._metadata["cycles"] += 1
            await self._log_event("cycle.tick", {"cycle": self._metadata["cycles"]})
            await self._evaluate_deadlines()
            self.resources.adjust_prices_from_usage()
            if target_cycles and self._metadata["cycles"] >= target_cycles:
                break
            await asyncio.sleep(1)

    async def _evaluate_deadlines(self) -> None:
        now = time.time()
        for job in self.registry.active_jobs():
            if job.spec.deadline_epoch < now and job.status != JobStatus.CANCELLED:
                job.cancel("deadline_expired")
                penalty = self.resources.slash(job.worker or job.spec.employer, job.spec.stake_required)
                await self._log_event(
                    "job.deadline_missed",
                    {
                        "job_id": job.job_id,
                        "penalty": penalty,
                        "deadline": job.spec.deadline_epoch,
                    },
                )
                await self._append_job_history(
                    {
                        "event": "deadline_missed",
                        "job_id": job.job_id,
                        "penalty": penalty,
                        "deadline": job.spec.deadline_epoch,
                    }
                )

    async def _checkpoint_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self.config.checkpoint_interval_seconds)
            self._save_state()

    async def _owner_command_loop(self) -> None:
        path = Path(self.config.owner_control_path)
        ack_path = Path(self.config.owner_ack_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        while self._running:
            await asyncio.sleep(2)
            if not path.exists():
                continue
            try:
                command = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            action = command.get("action")
            issuer = command.get("issuer", "owner")
            response: Dict[str, Any]
            if issuer not in self.config.governance_admins:
                response = {"status": "rejected", "reason": "unauthorized", "issuer": issuer}
            else:
                response = await self._execute_owner_action(action, command)
            ack_path.write_text(json.dumps(response, indent=2), encoding="utf-8")
            path.unlink(missing_ok=True)

    async def _execute_owner_action(self, action: Optional[str], payload: Dict[str, Any]) -> Dict[str, Any]:
        if action == "pause":
            self._paused = True
            return {"status": "ok", "action": "pause"}
        if action == "resume":
            self._paused = False
            return {"status": "ok", "action": "resume"}
        if action == "emergency_stop":
            self._emergency_stop = True
            return {"status": "ok", "action": "emergency_stop"}
        if action == "update_resource":
            field_name = payload["field"]
            value = float(payload["value"])
            self.resources.governance_update(field_name, value)
            return {"status": "ok", "action": "update_resource", "field": field_name, "value": value}
        if action == "spawn_job":
            spec_payload = payload["spec"]
            spec = JobSpec(
                title=spec_payload["title"],
                description=spec_payload["description"],
                reward=int(spec_payload.get("reward", self.config.default_reward)),
                stake_required=int(spec_payload.get("stake_required", self.config.default_reward * self.config.default_stake_ratio)),
                energy_budget=float(spec_payload.get("energy_budget", 1000.0)),
                compute_budget=float(spec_payload.get("compute_budget", 1000.0)),
                deadline_epoch=float(spec_payload.get("deadline_epoch", time.time() + 3600)),
                parent_id=spec_payload.get("parent_id"),
                employer=spec_payload.get("employer", "owner"),
                required_skills=list(spec_payload.get("required_skills", [])),
            )
            await self.post_job(spec)
            return {"status": "ok", "action": "spawn_job", "title": spec.title}
        return {"status": "unknown_action", "action": action}

    async def _simulation_loop(self) -> None:
        if not self.simulation:
            while self._running:
                await asyncio.sleep(5)
            return
        while self._running:
            await asyncio.sleep(self.config.simulation_tick_seconds)
            if self._paused or self._emergency_stop:
                continue
            action = {
                "energy": random.uniform(1_000.0, 10_000.0),
                "compute": random.uniform(1_000.0, 5_000.0),
                "resilience": random.uniform(0.0, 0.1),
            }
            targets = self._simulation_plugins or ([self.simulation] if self.simulation else [])
            for sim in targets:
                if sim is None:
                    continue
                state = sim.apply_action(action)
                self.resources.energy_reserve += state.energy_output * 0.01
                self.resources.compute_reserve += state.compute_output * 0.01
                await self._log_event(
                    "simulation.tick",
                    {
                        "population": state.population,
                        "energy_output": state.energy_output,
                        "compute_output": state.compute_output,
                        "stress_index": state.stress_index,
                        "narrative": state.narrative,
                    },
                )

    async def _start_agents(self) -> None:
        strategist_context = AgentContext(
            name="strategist",
            skills=["strategy", "finance"],
            orchestrator=self,
            bus=self.bus,
            resources=self.resources,
            registry=self.registry,
        )
        strategist = StrategistAgent(strategist_context)
        await strategist.start()
        self._strategists.append(strategist)
        self.resources.register_accounts(["owner"], initial_allocation=100_000.0)
        workers: Iterable[tuple[str, List[str]]] = [
            ("engineer", ["engineering", "infrastructure"]),
            ("researcher", ["research", "analysis"]),
            ("diplomat", ["governance", "negotiation"]),
        ]
        for name, skills in workers:
            context = AgentContext(
                name=name,
                skills=skills,
                orchestrator=self,
                bus=self.bus,
                resources=self.resources,
                registry=self.registry,
            )
            agent = WorkerAgent(context)
            await agent.start()
            self._agents.append(agent)
        for index in range(self.config.validators):
            name = f"validator-{index+1}"
            context = AgentContext(
                name=name,
                skills=["validation"],
                orchestrator=self,
                bus=self.bus,
                resources=self.resources,
                registry=self.registry,
            )
            validator = ValidatorAgent(context)
            await validator.start()
            self._validators.append(validator)
        self.resources.register_accounts(
            [agent.name for agent in (*self._agents, *self._strategists, *self._validators,)],
            initial_allocation=10_000.0,
        )

    async def _bootstrap_mission(self) -> None:
        if self.registry.all_jobs():
            return
        root_spec = JobSpec(
            title="Launch Kardashev-II Omega Upgrade",
            description="Mobilize planetary resources for Omega-grade AGI business operations.",
            reward=self.config.default_reward * 10,
            stake_required=int(self.config.default_reward * 10 * self.config.default_stake_ratio),
            energy_budget=self.config.energy_reserve * 0.01,
            compute_budget=self.config.compute_reserve * 0.01,
            deadline_epoch=time.time() + 6 * 3600,
            employer="owner",
            required_skills=["strategy"],
        )
        await self.post_job(root_spec)

    def _hydrate_state(self) -> None:
        if not self.config.resume_from_checkpoint:
            return
        payload = self.persistence.load()
        if not payload:
            return
        jobs_payload = payload.get("jobs", {})
        self.registry = JobRegistry.from_dict(jobs_payload)
        metadata = payload.get("metadata", {})
        self._metadata.update(metadata)
        self.resources.rehydrate_from_snapshot()

    def _save_state(self) -> None:
        metadata = dict(self._metadata)
        metadata.update(
            {
                "paused": self._paused,
                "emergency_stop": self._emergency_stop,
                "timestamp": time.time(),
            }
        )
        self.resources.take_snapshot()
        self.persistence.save(self.registry, metadata)
        asyncio.create_task(self._refresh_mermaid_dashboard())

    async def _log_event(self, event: str, payload: Dict[str, Any]) -> None:
        entry = {
            "event": event,
            "payload": payload,
            "timestamp": time.time(),
            "cycle": self._metadata.get("cycles", 0),
        }
        async with self._structured_log_lock:
            with self._log_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry) + "\n")

    async def _append_job_history(self, record: Dict[str, Any]) -> None:
        record = dict(record)
        record.setdefault("timestamp", time.time())
        async with self._job_history_lock:
            with self._job_history_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record) + "\n")

    def _config_summary(self) -> Dict[str, Any]:
        return {
            "cycles": self.config.cycles,
            "mission_hours": self.config.mission_hours,
            "validators": self.config.validators,
            "energy_reserve": self.config.energy_reserve,
            "compute_reserve": self.config.compute_reserve,
            "token_supply": self.config.token_supply,
        }

    async def _refresh_mermaid_dashboard(self) -> None:
        await asyncio.to_thread(self._write_mermaid_dashboard)

    def _write_mermaid_dashboard(self) -> None:
        path = Path(self.config.mermaid_dashboard_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        lines = ["graph TD"]
        class_defs = {
            JobStatus.POSTED.name: 'fill:#1d4ed8,stroke:#1e3a8a,stroke-width:2px,color:#fff',
            JobStatus.IN_PROGRESS.name: 'fill:#10b981,stroke:#047857,stroke-width:2px,color:#022c22',
            JobStatus.VALIDATING.name: 'fill:#fbbf24,stroke:#b45309,stroke-width:2px,color:#451a03',
            JobStatus.COMPLETE.name: 'fill:#22d3ee,stroke:#0f172a,stroke-width:2px,color:#083344',
            JobStatus.FAILED.name: 'fill:#ef4444,stroke:#7f1d1d,stroke-width:2px,color:#fff',
            JobStatus.CANCELLED.name: 'fill:#6b7280,stroke:#111827,stroke-width:2px,color:#f9fafb',
        }
        for job in self.registry.all_jobs():
            label = f"{job.job_id}\\n{job.spec.title}\\n{job.status.name}"
            lines.append(f'    {job.job_id}["{label}"]')
            if job.spec.parent_id:
                lines.append(f"    {job.spec.parent_id} --> {job.job_id}")
        lines.extend(
            f"    classDef {status} {style}" for status, style in class_defs.items()
        )
        lines.extend(
            f"    class {job.job_id} {job.status.name}"
            for job in self.registry.all_jobs()
        )
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def _load_simulation_plugins(self, plugin_paths: Optional[List[str]]) -> None:
        if not plugin_paths:
            return
        for dotted in plugin_paths:
            module_name, _, attr_name = dotted.partition(":")
            module = importlib.import_module(module_name)
            attr = attr_name or "SimulationPlugin"
            plugin_cls = getattr(module, attr)
            plugin = plugin_cls() if callable(plugin_cls) else plugin_cls
            if not isinstance(plugin, PlanetarySim):
                raise TypeError(f"Simulation plugin {dotted} must implement PlanetarySim")
            self._simulation_plugins.append(plugin)
        if self._simulation_plugins and self.simulation is None:
            self.simulation = self._simulation_plugins[0]

__all__ = ["SupremeOrchestrator"]
