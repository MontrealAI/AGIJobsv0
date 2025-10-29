"""MuZero-inspired planning core."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import List, Tuple

import numpy as np

from .config import PlannerConfig
from .knowledge import KnowledgeLake
from .task_router import Job

LOGGER = logging.getLogger("agi_alpha_node")


@dataclass
class PlanResult:
    job: Job
    expected_reward: float
    rationale: str


class MuZeroPlanner:
    def __init__(self, config: PlannerConfig, knowledge: KnowledgeLake):
        self.config = config
        self.knowledge = knowledge

    def plan(self, jobs: List[Job]) -> PlanResult:
        if not jobs:
            raise ValueError("Planner requires at least one job")
        LOGGER.debug("Planning over jobs", extra={"event": "planner_start", "data": {"jobs": len(jobs)}})
        scores = [self._evaluate_job(job) for job in jobs]
        best_index = int(np.argmax([score for score, _ in scores]))
        best_job = jobs[best_index]
        reward, rationale = scores[best_index]
        LOGGER.info(
            "Planner selected job",
            extra={"event": "planner_selected", "data": {"job": best_job.job_id, "reward": reward}},
        )
        self.knowledge.add_entry(
            "planner",
            f"Chose {best_job.job_id} expecting reward {reward:.2f} because {rationale}",
        )
        return PlanResult(best_job, reward, rationale)

    def _evaluate_job(self, job: Job) -> Tuple[float, str]:
        horizon = self.config.horizon
        exploration = self.config.exploration_constant
        past_performance = len(self.knowledge.search(job.domain))
        intrinsic = job.reward / (1 + job.complexity * self.config.risk_aversion)
        simulated_paths = []
        for depth in range(1, horizon + 1):
            variance = math.log1p(depth) * exploration
            simulated_reward = intrinsic * (1 + 0.01 * past_performance) - variance
            simulated_paths.append(simulated_reward)
        score = float(np.mean(simulated_paths))
        rationale = (
            f"intrinsic reward {intrinsic:.1f}, horizon {horizon}, past performance {past_performance},"
            f" exploration penalty {exploration:.2f}"
        )
        return score, rationale


__all__ = ["MuZeroPlanner", "PlanResult"]
