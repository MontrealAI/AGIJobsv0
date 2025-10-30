"""Evaluation pipeline for AlphaEvolve demo."""
from __future__ import annotations

import asyncio
import statistics
from dataclasses import dataclass
from typing import Callable, Iterable, List, Sequence

from .heuristics import AgentProfile, JobListing, estimate_latency, price_job, rank_candidates


@dataclass(frozen=True)
class EvaluationResult:
    gmv: float
    cost: float
    utility: float
    latency: float
    acceptance_rate: float
    fairness: float
    risk: float


@dataclass(frozen=True)
class SimulationConfig:
    demand_index: float = 0.5
    latency_slo: float = 2.2
    fairness_floor: float = 0.4


class MarketSimulation:
    """Runs deterministic simulations to produce evaluation metrics."""

    def __init__(self, jobs: Sequence[JobListing], agents: Sequence[AgentProfile], config: SimulationConfig | None = None) -> None:
        self.jobs = list(jobs)
        self.agents = list(agents)
        self.config = config or SimulationConfig()

    def run(self, candidate_ranker: Callable[[JobListing, Iterable[AgentProfile]], List[AgentProfile]]) -> EvaluationResult:
        assignments: list[tuple[JobListing, AgentProfile]] = []
        total_cost = 0.0
        total_value = 0.0
        latencies: list[float] = []
        chosen_agents: dict[str, int] = {}

        for job in self.jobs:
            ranked_agents = candidate_ranker(job, self.agents)
            if not ranked_agents:
                continue
            selected = ranked_agents[0]
            if selected.cost_per_job > job.max_cost:
                continue
            assignments.append((job, selected))
            total_value += min(job.value, job.max_cost)
            total_cost += selected.cost_per_job
            latencies.append(estimate_latency(selected, job))
            chosen_agents[selected.agent_id] = chosen_agents.get(selected.agent_id, 0) + 1

        accepted_jobs = len(assignments)
        fairness = self._compute_fairness(chosen_agents)
        average_latency = statistics.mean(latencies) if latencies else 0.0
        utility = total_value - total_cost
        risk = self._compute_risk(total_cost, total_value)
        acceptance_rate = accepted_jobs / len(self.jobs) if self.jobs else 0.0

        return EvaluationResult(
            gmv=total_value,
            cost=total_cost,
            utility=utility,
            latency=average_latency,
            acceptance_rate=acceptance_rate,
            fairness=fairness,
            risk=risk,
        )

    @staticmethod
    def _compute_risk(cost: float, value: float) -> float:
        if value == 0:
            return 1.0
        ratio = cost / value
        return max(0.0, min(1.0, ratio))

    def _compute_fairness(self, chosen_agents: dict[str, int]) -> float:
        if not chosen_agents:
            return 0.0
        counts = list(chosen_agents.values())
        if len(counts) == 1:
            return 1.0
        std_dev = statistics.pstdev(counts)
        mean_value = statistics.mean(counts)
        if mean_value == 0:
            return 0.0
        fairness_index = 1 - min(std_dev / mean_value, 1)
        return fairness_index


class EvaluationHarness:
    """Implements the multi-stage evaluation pipeline described in the specification."""

    def __init__(self, simulation: MarketSimulation) -> None:
        self.simulation = simulation

    async def evaluate(self, candidate_ranker: Callable[[JobListing, Iterable[AgentProfile]], List[AgentProfile]]) -> EvaluationResult:
        stage1 = await self._stage_one(candidate_ranker)
        if not self._passes_stage_one(stage1):
            return stage1
        stage2 = await self._stage_two(candidate_ranker)
        if not self._passes_stage_two(stage2):
            return stage2
        stage3 = await self._stage_three(candidate_ranker)
        return stage3

    async def _stage_one(self, candidate_ranker: Callable[[JobListing, Iterable[AgentProfile]], List[AgentProfile]]) -> EvaluationResult:
        result = self.simulation.run(candidate_ranker)
        return result

    async def _stage_two(self, candidate_ranker: Callable[[JobListing, Iterable[AgentProfile]], List[AgentProfile]]) -> EvaluationResult:
        await asyncio.sleep(0)
        return self.simulation.run(candidate_ranker)

    async def _stage_three(self, candidate_ranker: Callable[[JobListing, Iterable[AgentProfile]], List[AgentProfile]]) -> EvaluationResult:
        await asyncio.sleep(0)
        return self.simulation.run(candidate_ranker)

    def _passes_stage_one(self, result: EvaluationResult) -> bool:
        return result.latency <= self.simulation.config.latency_slo

    def _passes_stage_two(self, result: EvaluationResult) -> bool:
        return result.fairness >= self.simulation.config.fairness_floor

