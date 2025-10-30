"""Evaluation harness for the AlphaEvolve demo."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from statistics import mean
from typing import Dict, Mapping

from . import heuristics
from .data import SimulationDataset, baseline_dataset, shadow_dataset, stress_dataset
from .diff_engine import DiffProposal
from .sandbox import Sandbox


@dataclass(frozen=True)
class EvaluationResult:
    metrics: Dict[str, float]
    stage_details: Dict[str, Dict[str, float]]


class EvaluationError(Exception):
    """Raised when a candidate fails evaluation."""


def _gini_index(weights: Dict[str, float]) -> float:
    values = sorted(weights.values())
    total = sum(values)
    if total == 0:
        return 0.0
    cumulative = 0.0
    gini = 0.0
    n = len(values)
    for idx, value in enumerate(values, start=1):
        cumulative += value
        gini += (2 * idx - n - 1) * value
    return gini / (n * total)


class EvaluationHarness:
    def __init__(self, source: str, config: Mapping[str, object]) -> None:
        self._sandbox = Sandbox()
        self._config = config
        self._baseline_source = source
        self._required_symbols = {
            "score_match": "score heuristic",
            "price_job": "pricing heuristic",
            "rank_candidates": "ranking heuristic",
            "sequence_jobs": "job sequencing heuristic",
        }
        self._baseline_dataset = baseline_dataset(int(config["evaluation"]["baseline_seed"]))
        self._stress_dataset = stress_dataset(int(config["evaluation"]["stress_seed"]))
        self._shadow_dataset = shadow_dataset(int(config["evaluation"]["shadow_seed"]))
        self._baseline_result = self.evaluate_source(source)

    @property
    def baseline_metrics(self) -> Mapping[str, float]:
        return self._baseline_result.metrics

    def apply_diff(self, diff: DiffProposal) -> str:
        return diff.apply(self._baseline_source)

    def evaluate_diff(self, diff: DiffProposal) -> EvaluationResult:
        candidate_source = diff.apply(self._baseline_source)
        return self.evaluate_source(candidate_source)

    def evaluate_source(self, source: str) -> EvaluationResult:
        module = self._sandbox.compile(source)
        functions = self._sandbox.load_functions(module, self._required_symbols)
        self._stage_one_sanity(functions)
        baseline_metrics = self._simulate(self._baseline_dataset, functions)
        stress_metrics = self._simulate(self._stress_dataset, functions)
        shadow_metrics = self._simulate(self._shadow_dataset, functions)
        aggregate = self._combine_metrics(
            baseline_metrics,
            stress_metrics,
            shadow_metrics,
        )
        return EvaluationResult(
            metrics=aggregate,
            stage_details={
                "baseline": baseline_metrics,
                "stress": stress_metrics,
                "shadow": shadow_metrics,
            },
        )

    def _stage_one_sanity(self, functions: Mapping[str, object]) -> None:
        score_fn = functions["score_match"]
        agent = heuristics.Agent(
            agent_id="sanity",
            reputation=0.5,
            stake=0.4,
            specialization=("ml", "ops"),
            reliability=0.7,
            latency_ms=300.0,
            cost_per_unit=40.0,
        )
        job = heuristics.Job(
            job_id="sanity-job",
            value=250.0,
            required_skills=("ml", "design"),
            urgency=0.6,
            complexity=2.0,
            max_latency_ms=420.0,
        )
        ctx = heuristics.HeuristicContext()
        score = score_fn(agent, job, ctx)
        if not (0 <= score <= 10):
            raise EvaluationError("Score sanity check failed")

    def _simulate(self, dataset: SimulationDataset, functions: Mapping[str, object]) -> Dict[str, float]:
        score_fn = functions["score_match"]
        price_fn = functions["price_job"]
        rank_fn = functions["rank_candidates"]
        sequence_fn = functions["sequence_jobs"]
        ctx = dataset.context
        total_gmv = 0.0
        total_cost = 0.0
        total_latency = 0.0
        total_acceptance = 0.0
        fairness_weights: Dict[str, float] = {}
        risk_accumulator = 0.0
        owner_revenue = 0.0
        operator_revenue = 0.0
        processed_jobs = 0.0
        sequenced_jobs = sequence_fn(dataset.jobs, ctx)
        for job in sequenced_jobs:
            ranked = rank_fn(job, dataset.agents, ctx)
            if not ranked:
                continue
            primary_agent = ranked[0]
            score = max(0.0, min(1.0, score_fn(primary_agent, job, ctx)))
            acceptance = min(1.0, 0.32 + primary_agent.reliability * 0.48 + score * 0.28)
            price = price_fn(primary_agent, job, ctx)
            production_cost = primary_agent.cost_per_unit * job.complexity
            value = job.value
            gmv = value * acceptance
            cost = production_cost * acceptance
            latency = primary_agent.latency_ms
            total_gmv += gmv
            total_cost += cost
            total_latency += latency * acceptance
            total_acceptance += acceptance
            fairness_weights[primary_agent.agent_id] = fairness_weights.get(primary_agent.agent_id, 0.0) + acceptance
            risk_accumulator += max(0.0, 1 - primary_agent.reliability) * acceptance
            owner_revenue += price * acceptance * ctx.owner_treasury_split
            operator_revenue += price * acceptance * ctx.operator_spread
            processed_jobs += 1.0
        fairness = 1.0 - _gini_index(fairness_weights)
        if processed_jobs == 0:
            latency = ctx.latency_target_ms
            acceptance_rate = 0.0
        else:
            latency = total_latency / max(total_acceptance, 1e-9)
            acceptance_rate = total_acceptance / processed_jobs
        utility = total_gmv - total_cost
        risk = min(1.0, ctx.recent_drop_rate + risk_accumulator / max(processed_jobs, 1.0) * 0.05)
        return {
            "GMV": round(total_gmv, 6),
            "Cost": round(total_cost, 6),
            "Utility": round(utility, 6),
            "Latency": round(latency, 6),
            "Fairness": round(max(0.0, min(1.0, fairness)), 6),
            "AcceptanceRate": round(max(0.0, min(1.0, acceptance_rate)), 6),
            "Risk": round(risk, 6),
            "OwnerRevenue": round(owner_revenue, 6),
            "OperatorRevenue": round(operator_revenue, 6),
        }

    def _combine_metrics(
        self,
        baseline_metrics: Mapping[str, float],
        stress_metrics: Mapping[str, float],
        shadow_metrics: Mapping[str, float],
    ) -> Dict[str, float]:
        combined = {
            key: mean(
                [baseline_metrics[key], stress_metrics[key], shadow_metrics[key]]
            )
            for key in {"GMV", "Cost", "Utility", "Latency", "Fairness", "AcceptanceRate", "Risk"}
        }
        combined["OwnerRevenue"] = mean(
            [baseline_metrics["OwnerRevenue"], stress_metrics["OwnerRevenue"], shadow_metrics["OwnerRevenue"]]
        )
        combined["OperatorRevenue"] = mean(
            [baseline_metrics["OperatorRevenue"], stress_metrics["OperatorRevenue"], shadow_metrics["OperatorRevenue"]]
        )
        return {key: round(value, 6) for key, value in combined.items()}


async def evaluate_diff_async(harness: EvaluationHarness, diff: DiffProposal) -> EvaluationResult:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, harness.evaluate_diff, diff)


__all__ = ["EvaluationHarness", "EvaluationResult", "EvaluationError", "evaluate_diff_async"]
