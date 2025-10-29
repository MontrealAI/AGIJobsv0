"""Simulation harness comparing TRM, LLM and greedy strategies."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from .economic import EconomicLedger
from .engine import TinyRecursiveModel, TinyRecursiveModelResult
from .sentinel import Sentinel
from .subgraph import SubgraphLogger
from .thermostat import Thermostat
from .utils import CandidateProfile, generate_candidate


GROUND_TRUTH_WEIGHTS = np.array(
    [
        1.45,
        1.1,
        0.82,
        -0.62,
        0.95,
        0.55,
        0.42,
        -0.38,
        0.28,
    ],
    dtype=np.float64,
)
GROUND_TRUTH_BIAS = -0.35


def _sigmoid(x: float) -> float:
    x = max(min(x, 60.0), -60.0)
    return 1.0 / (1.0 + np.exp(-x))


def ground_truth_probability(vector: np.ndarray) -> float:
    return float(_sigmoid(float(GROUND_TRUTH_WEIGHTS @ vector + GROUND_TRUTH_BIAS)))


@dataclass
class SimulationConfig:
    """User friendly configuration for the conversion funnel simulation."""

    opportunities: int = 200
    candidates_per_opportunity: int = 3
    conversion_value: float = 100.0
    greedy_cost: float = 0.0001
    llm_cost: float = 0.05
    trm_base_cost: float = 0.001
    trm_cost_per_step: float = 0.0001
    random_seed: int = 2025


@dataclass
class StrategyStats:
    """Aggregate metrics for a strategy."""

    name: str
    attempts: int = 0
    successes: int = 0
    total_cost: float = 0.0
    total_value: float = 0.0
    extra: Dict[str, float] = field(default_factory=dict)

    def record(self, success: bool, cost: float, value: float) -> None:
        self.attempts += 1
        self.total_cost += cost
        if success:
            self.successes += 1
            self.total_value += value

    @property
    def success_rate(self) -> float:
        if self.attempts == 0:
            return 0.0
        return self.successes / self.attempts

    @property
    def roi(self) -> float:
        if self.total_cost == 0:
            return float("inf") if self.successes else 0.0
        return (self.total_value - self.total_cost) / self.total_cost


@dataclass
class SimulationOutcome:
    """Complete simulation report."""

    strategies: Dict[str, StrategyStats]
    trm_trajectory: List[int]
    sentinel_events: List[str]

    def as_dict(self) -> Dict[str, Dict[str, float]]:
        return {
            name: {
                "attempts": stats.attempts,
                "success_rate": stats.success_rate,
                "roi": stats.roi,
                "total_cost": stats.total_cost,
                "total_value": stats.total_value,
            }
            for name, stats in self.strategies.items()
        }


class ConversionSimulation:
    """Monte Carlo style simulation of conversion strategies."""

    def __init__(
        self,
        config: SimulationConfig,
        model: TinyRecursiveModel,
        ledger: EconomicLedger,
        thermostat: Thermostat,
        sentinel: Sentinel,
        subgraph: SubgraphLogger,
        rng: Optional[np.random.Generator] = None,
    ) -> None:
        self.config = config
        self.model = model
        self.ledger = ledger
        self.thermostat = thermostat
        self.sentinel = sentinel
        self.subgraph = subgraph
        self.rng = rng or np.random.default_rng(self.config.random_seed)
        self._cumulative_cost = 0.0
        self._trm_steps: List[int] = []
        self._sentinel_events: List[str] = []

    def run(self) -> SimulationOutcome:
        stats = {
            "greedy": StrategyStats(name="Greedy Baseline"),
            "llm": StrategyStats(name="LLM"),
            "trm": StrategyStats(name="Tiny Recursive Model"),
        }

        for opportunity_index in range(self.config.opportunities):
            candidates = [
                generate_candidate(f"cand-{opportunity_index}-{i}", self.rng)
                for i in range(self.config.candidates_per_opportunity)
            ]
            feature_matrix = np.stack([candidate.as_feature_vector() for candidate in candidates])
            ground_truth = np.array(
                [ground_truth_probability(vector) for vector in feature_matrix]
            )

            greedy_index = int(np.argmax(feature_matrix[:, 0]))
            greedy_prob = ground_truth[greedy_index]
            greedy_success = bool(self.rng.random() < greedy_prob)
            stats["greedy"].record(greedy_success, self.config.greedy_cost, self.config.conversion_value)

            llm_scores = ground_truth + self.rng.normal(0.0, 0.05, size=len(candidates))
            llm_index = int(np.argmax(llm_scores))
            llm_prob = ground_truth[llm_index]
            llm_success = bool(self.rng.random() < llm_prob)
            stats["llm"].record(llm_success, self.config.llm_cost, self.config.conversion_value)

            trm_result = self._run_trm(candidates)
            if trm_result is None:
                # Sentinel halted TRM usage; fall back to greedy decision
                stats["trm"].record(greedy_success, self.config.greedy_cost, self.config.conversion_value)
                continue

            chosen_index, inference_result = trm_result
            trm_prob = ground_truth[chosen_index]
            trm_success = bool(self.rng.random() < trm_prob)
            cost = self.config.trm_base_cost + self.config.trm_cost_per_step * inference_result.steps_used
            stats["trm"].record(trm_success, cost, self.config.conversion_value)

            if trm_success:
                self.ledger.record_success(
                    value=self.config.conversion_value,
                    cost=cost,
                    metadata={
                        "opportunity": float(opportunity_index),
                        "steps": float(inference_result.steps_used),
                        "latency_ms": inference_result.latency_ms,
                    },
                )
            else:
                self.ledger.record_failure(
                    cost=cost,
                    metadata={
                        "opportunity": float(opportunity_index),
                        "steps": float(inference_result.steps_used),
                        "latency_ms": inference_result.latency_ms,
                    },
                )

            self.subgraph.log(
                {
                    "opportunity": opportunity_index,
                    "steps": inference_result.steps_used,
                    "halted": inference_result.halted,
                    "probability": inference_result.prediction,
                    "latency_ms": inference_result.latency_ms,
                }
            )

            self._trm_steps.append(inference_result.steps_used)
            self._cumulative_cost += cost

            new_cycles, new_outer, new_halt = self.thermostat.recommend(
                self.ledger,
                self.model.config.n_cycles,
                self.model.config.outer_steps,
                self.model.config.halt_threshold,
            )
            self.model.update_params(n_cycles=new_cycles, outer_steps=new_outer, halt_threshold=new_halt)

        self.subgraph.flush()

        stats["trm"].extra["avg_steps"] = (
            sum(self._trm_steps) / len(self._trm_steps) if self._trm_steps else 0.0
        )
        return SimulationOutcome(strategies=stats, trm_trajectory=self._trm_steps, sentinel_events=self._sentinel_events)

    def _run_trm(
        self,
        candidates: Iterable[CandidateProfile],
    ) -> Optional[Tuple[int, TinyRecursiveModelResult]]:
        """Run TRM inference with guardrail handling."""

        candidate_list = list(candidates)
        feature_matrix = np.stack([candidate.as_feature_vector() for candidate in candidate_list])
        results: List[TinyRecursiveModelResult] = []
        for vector in feature_matrix:
            result = self.model.infer(vector)
            results.append(result)
            self.sentinel.evaluate(
                ledger=self.ledger,
                cumulative_cost=self._cumulative_cost,
                last_run_latency_ms=result.latency_ms,
                last_run_steps=result.steps_used,
            )
            if self.sentinel.halt_requested:
                self._sentinel_events.append(self.sentinel.reason)
                return None

        probabilities = np.array([result.prediction for result in results])
        chosen_index = int(np.argmax(probabilities))
        return chosen_index, results[chosen_index]

