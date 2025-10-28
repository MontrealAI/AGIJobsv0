from __future__ import annotations

from typing import Dict, Iterable, List, Optional

from .blockchain import BlockchainClient
from .config import Config
from .logging_utils import json_log
from .metrics import MetricsRegistry
from .planner import Planner, PlanStep
from .specialists import Specialist, SpecialistOutcome


class JobManager:
    def __init__(
        self,
        config: Config,
        blockchain: BlockchainClient,
        planner: Planner,
        specialists: Dict[str, Specialist],
        metrics: MetricsRegistry,
    ) -> None:
        self.config = config
        self.blockchain = blockchain
        self.planner = planner
        self.specialists = specialists
        self.metrics = metrics
        self._active_jobs: List[str] = []

    def _choose_specialist(self, domain: str) -> Optional[Specialist]:
        return self.specialists.get(domain)

    def _execute_plan_step(self, step: PlanStep, job_payload: Dict[str, object]) -> Optional[SpecialistOutcome]:
        specialist = self._choose_specialist(step.domain)
        if not specialist:
            json_log("job_skipped", job_id=step.job_id, reason="no_specialist")
            return None
        outcome = specialist.execute(job_payload)
        json_log("job_executed", job_id=step.job_id, domain=step.domain, reward=outcome.reward)
        self.blockchain.record_job_completion(step.job_id, outcome.reward, outcome.notes)
        self.planner.adjust_after_outcome(outcome.reward)
        return outcome

    def execute_cycle(self) -> List[SpecialistOutcome]:
        if self.blockchain.is_paused():
            json_log("job_cycle_skipped", reason="paused")
            return []
        if not self.blockchain.verify_identity_prerequisites():
            json_log("job_cycle_skipped", reason="identity_not_verified")
            return []
        jobs = self.blockchain.list_available_jobs()
        plan = self.planner.plan(jobs)
        outcomes: List[SpecialistOutcome] = []
        for step in plan[: self.config.orchestrator.concurrent_jobs]:
            payload = next((job for job in jobs if job["job_id"] == step.job_id), None)
            if payload is None:
                continue
            outcome = self._execute_plan_step(step, payload)
            if outcome:
                outcomes.append(outcome)
        summary = Specialist.summarise_outcomes(outcomes)
        self.metrics.set_gauge("agi_alpha_node_rewards_last_cycle", summary["total_reward"])
        self.metrics.set_gauge("agi_alpha_node_confidence_last_cycle", summary["avg_confidence"])
        self.metrics.inc_counter("agi_alpha_node_jobs_completed", len(outcomes))
        json_log("job_cycle_completed", outcomes=[outcome.__dict__ for outcome in outcomes])
        self._active_jobs = [outcome.job_id for outcome in outcomes]
        return outcomes

    def active_jobs(self) -> List[str]:
        return list(self._active_jobs)

    def diagnostics(self) -> Dict[str, object]:
        return {
            "active_jobs": self.active_jobs(),
            "specialists": list(self.specialists.keys()),
        }
