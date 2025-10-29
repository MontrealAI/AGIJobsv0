"""Planner ↔ specialist orchestration."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict

from rich.console import Console
from rich.table import Table

from .config import AlphaNodeConfig
from .knowledge import KnowledgeLake
from .planner import MuZeroPlanner, PlanResult
from .safety import SafetyManager
from .specialists import SpecialistAgent, SpecialistContext, load_specialist
from .staking import StakeManagerClient
from .task_router import Job, TaskHarvester

LOGGER = logging.getLogger("agi_alpha_node")


@dataclass
class ExecutionResult:
    job: Job
    specialist_outputs: Dict[str, Dict[str, str]]
    expected_reward: float


class Orchestrator:
    def __init__(
        self,
        config: AlphaNodeConfig,
        knowledge: KnowledgeLake,
        stake_client: StakeManagerClient,
        safety: SafetyManager,
        console: Console | None = None,
    ):
        self.config = config
        self.knowledge = knowledge
        self.stake_client = stake_client
        self.safety = safety
        self.console = console or Console()
        self.harvester = TaskHarvester(config.jobs)
        self.specialists: Dict[str, SpecialistAgent] = {}
        self._planner = MuZeroPlanner(config.planner, knowledge)

    def load_specialists(self) -> None:
        for spec_config in self.config.specialists:
            cls = load_specialist(spec_config.class_path)
            specialist = cls(capabilities=spec_config.capabilities)
            self.specialists[spec_config.name] = specialist
            LOGGER.info(
                "Specialist loaded",
                extra={"event": "specialist_loaded", "data": {"name": spec_config.name}},
            )

    def capability_scores(self) -> Dict[str, float]:
        return {
            name: min(1.0, 0.6 + 0.05 * len(self.knowledge.search(name)))
            for name in self.specialists
        }

    def run_cycle(self) -> ExecutionResult:
        self.safety.ensure_active()
        status = self.stake_client.current_status()
        if not status.is_active:
            if self.config.safety.pause_on_slash_risk:
                self.safety.pause("Stake below minimum")
            raise RuntimeError("Insufficient stake to activate node")
        capability_scores = self.capability_scores()
        jobs = self.harvester.eligible_jobs(capability_scores)
        plan = self._planner.plan(jobs)
        outputs = self._execute_specialists(plan.job)
        self._render_cycle(plan, outputs)
        return ExecutionResult(plan.job, outputs, plan.expected_reward)

    def _execute_specialists(self, job: Job) -> Dict[str, Dict[str, str]]:
        context = SpecialistContext(knowledge=self.knowledge, planner_goal=self.config.planner.economic_goal)
        results: Dict[str, Dict[str, str]] = {}
        for name, specialist in self.specialists.items():
            if job.domain != name:
                continue
            results[name] = specialist.solve(job.payload, context)
            LOGGER.info(
                "Specialist completed job",
                extra={"event": "specialist_complete", "data": {"name": name, "job": job.job_id}},
            )
        return results

    def _render_cycle(self, plan: PlanResult, outputs: Dict[str, Dict[str, str]]) -> None:
        table = Table(title=f"Execution Summary • Job {plan.job.job_id}")
        table.add_column("Specialist")
        table.add_column("Key Outputs")
        for name, data in outputs.items():
            summary = ", ".join(f"{k}: {v}" for k, v in data.items())
            table.add_row(name, summary)
        table.add_row("expected_reward", f"{plan.expected_reward:.2f}")
        self.console.print(table)


__all__ = ["Orchestrator", "ExecutionResult"]
