"""Task orchestration for the AGI Alpha Node demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List
import logging

from .blockchain import BlockchainClient
from .knowledge import KnowledgeLake
from .planner import MuZeroPlanner, PlanCandidate
from .specialists import Specialist, build_specialists

LOGGER = logging.getLogger(__name__)


@dataclass
class ExecutionResult:
    job_id: str
    domain: str
    reward: float
    insights: Dict[str, object]


class Orchestrator:
    def __init__(self, blockchain: BlockchainClient, knowledge: KnowledgeLake, planner: MuZeroPlanner | None = None) -> None:
        self._blockchain = blockchain
        self._knowledge = knowledge
        self._planner = planner or MuZeroPlanner()
        self._specialists = build_specialists(knowledge)

    def evaluate_and_execute(self, jobs: Iterable[Dict[str, object]]) -> List[ExecutionResult]:
        plan_candidates = self._planner.plan(jobs)
        results: List[ExecutionResult] = []

        for candidate in plan_candidates:
            specialist = self._specialists.get(candidate.domain)
            if not specialist:
                LOGGER.warning(
                    "No specialist available", extra={"domain": candidate.domain, "job": candidate.job_id}
                )
                continue

            if candidate.risk_score > 0.8:
                LOGGER.warning(
                    "Skipping high-risk job",
                    extra={"job_id": candidate.job_id, "risk": candidate.risk_score},
                )
                continue

            job_payload = {
                "job_id": candidate.job_id,
                "domain": candidate.domain,
                "reward": candidate.expected_reward,
            }
            LOGGER.info(
                "Dispatching job to specialist",
                extra={"job_id": candidate.job_id, "domain": candidate.domain},
            )
            outcome = specialist.execute(job_payload)
            self._planner.record_outcome(candidate.domain, float(outcome["reward"]))
            results.append(
                ExecutionResult(
                    job_id=candidate.job_id,
                    domain=candidate.domain,
                    reward=float(outcome["reward"]),
                    insights=dict(outcome.get("insights", {})),
                )
            )

        return results


__all__ = ["Orchestrator", "ExecutionResult"]
