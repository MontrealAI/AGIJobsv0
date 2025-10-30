"""Core OMNI curriculum engine for the Open-Endedness demo.

This implementation is intentionally production-grade while remaining fully
self-contained so that a non-technical operator can run the entire stack from the
provided CLI.
"""
from __future__ import annotations

import math
import random
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Iterable, List, Mapping, MutableMapping, Optional, Tuple


@dataclass
class TaskMetrics:
    """Holds per-task state required for learning progress."""

    fast_ema: float = 0.0
    slow_ema: float = 0.0
    lp: float = 0.0
    successes: int = 0
    attempts: int = 0
    value_accumulator: float = 0.0
    cost_accumulator: float = 0.0

    def update(self, success: bool, reward_value: float, cost: float,
               fast_beta: float, slow_beta: float) -> None:
        """Update exponential moving averages and derived metrics."""
        self.attempts += 1
        if success:
            self.successes += 1
        self.value_accumulator += reward_value
        self.cost_accumulator += cost
        target = 1.0 if success else 0.0
        if self.attempts == 1:
            # bootstrap EMAs to first observation for stability
            self.fast_ema = target
            self.slow_ema = target
        else:
            self.fast_ema = fast_beta * self.fast_ema + (1.0 - fast_beta) * target
            self.slow_ema = slow_beta * self.slow_ema + (1.0 - slow_beta) * target
        self.lp = max(self.fast_ema - self.slow_ema, 0.0)

    @property
    def success_rate(self) -> float:
        if self.attempts == 0:
            return 0.0
        return self.successes / self.attempts

    @property
    def roi(self) -> float:
        cost = self.cost_accumulator or 1e-9
        return (self.value_accumulator / cost) if cost else float("inf")


@dataclass
class InterestingnessVerdict:
    interesting: bool
    rationale: str = ""


class InterestingnessOracle:
    """Protocol for interestingness oracles."""

    def score(self, tasks: Iterable[str], context: Mapping[str, TaskMetrics]) -> Mapping[str, InterestingnessVerdict]:
        raise NotImplementedError


@dataclass
class OmniConfig:
    fast_ema_beta: float
    slow_ema_beta: float
    lp_floor: float
    moi_weight_interesting: float
    moi_weight_boring: float
    min_probability: float
    fallback_strategy: str
    partition_update_interval: int
    exploration_epsilon: float
    exploration_decay: float


@dataclass
class DistributionSnapshot:
    probabilities: Dict[str, float]
    lp_values: Dict[str, float]
    interesting: Dict[str, bool]


class OmniCurriculumEngine:
    """Implements LP + MoI fusion sampling."""

    def __init__(
        self,
        tasks: Iterable[str],
        config: OmniConfig,
        oracle: InterestingnessOracle,
        rng: Optional[random.Random] = None,
    ) -> None:
        self._config = config
        self._oracle = oracle
        self._rng = rng or random.Random()
        self._metrics: Dict[str, TaskMetrics] = {task: TaskMetrics() for task in tasks}
        self._interesting_flags: Dict[str, bool] = {task: True for task in tasks}
        self._distribution: Dict[str, float] = {task: 1.0 / len(self._metrics) for task in self._metrics}
        self._episodes_since_partition = 0
        self._history: Deque[DistributionSnapshot] = deque(maxlen=2048)

    @property
    def metrics(self) -> Mapping[str, TaskMetrics]:
        return self._metrics

    @property
    def distribution(self) -> Mapping[str, float]:
        return self._distribution

    @property
    def interesting_flags(self) -> Mapping[str, bool]:
        return self._interesting_flags

    @property
    def history(self) -> Iterable[DistributionSnapshot]:
        return tuple(self._history)

    def update_outcome(self, task: str, success: bool, value: float, cost: float) -> None:
        if task not in self._metrics:
            raise KeyError(f"Unknown task '{task}'")
        self._metrics[task].update(success, value, cost,
                                   self._config.fast_ema_beta,
                                   self._config.slow_ema_beta)

    def _compute_lp_weights(self) -> Dict[str, float]:
        lp_values = {
            task: max(metrics.lp, self._config.lp_floor)
            for task, metrics in self._metrics.items()
        }
        total = sum(lp_values.values())
        if total <= 0:
            uniform = 1.0 / len(self._metrics)
            return {task: uniform for task in self._metrics}
        return {task: value / total for task, value in lp_values.items()}

    def _apply_interestingness(self, lp_weights: Mapping[str, float]) -> Dict[str, float]:
        scaled = {}
        for task, weight in lp_weights.items():
            modifier = (self._config.moi_weight_interesting
                        if self._interesting_flags.get(task, True)
                        else self._config.moi_weight_boring)
            scaled[task] = max(weight * modifier, self._config.min_probability)
        total = sum(scaled.values())
        return {task: value / total for task, value in scaled.items()}

    def refresh_partition(self) -> None:
        verdicts = self._oracle.score(self._metrics.keys(), self._metrics)
        for task, verdict in verdicts.items():
            self._interesting_flags[task] = verdict.interesting
        self._episodes_since_partition = 0

    def _maybe_refresh_partition(self) -> None:
        self._episodes_since_partition += 1
        if self._episodes_since_partition >= self._config.partition_update_interval:
            self.refresh_partition()

    def sample_task(self) -> str:
        self._maybe_refresh_partition()
        lp_weights = self._compute_lp_weights()
        probs = self._apply_interestingness(lp_weights)
        epsilon = self._config.exploration_epsilon
        if self._rng.random() < epsilon:
            task = self._rng.choice(list(self._metrics.keys()))
        else:
            threshold = self._rng.random()
            cumulative = 0.0
            task = next(iter(self._metrics))
            for candidate, prob in probs.items():
                cumulative += prob
                if threshold <= cumulative:
                    task = candidate
                    break
        self._distribution = probs
        self._history.append(
            DistributionSnapshot(
                probabilities=dict(probs),
                lp_values={task: metrics.lp for task, metrics in self._metrics.items()},
                interesting=dict(self._interesting_flags),
            )
        )
        self._config.exploration_epsilon = max(
            self._config.exploration_epsilon * self._config.exploration_decay,
            0.01,
        )
        return task

    def batch_sample(self, count: int) -> List[str]:
        return [self.sample_task() for _ in range(count)]

    def snapshot(self) -> DistributionSnapshot:
        return DistributionSnapshot(
            probabilities=dict(self._distribution),
            lp_values={task: metrics.lp for task, metrics in self._metrics.items()},
            interesting=dict(self._interesting_flags),
        )

    def roi_summary(self) -> Dict[str, float]:
        return {task: metrics.roi for task, metrics in self._metrics.items()}

    def ensure_task(self, task_id: str) -> None:
        if task_id not in self._metrics:
            self._metrics[task_id] = TaskMetrics()
            self._interesting_flags[task_id] = True
            uniform = 1.0 / len(self._metrics)
            self._distribution = {task: uniform for task in self._metrics}


class StubInterestingnessOracle(InterestingnessOracle):
    """Deterministic interestingness oracle for the demo."""

    def __init__(self, boring_relations: Mapping[str, Iterable[str]]) -> None:
        self._boring_map = {
            anchor: set(relations) | {anchor}
            for anchor, relations in boring_relations.items()
        }

    def score(self, tasks: Iterable[str], context: Mapping[str, TaskMetrics]) -> Mapping[str, InterestingnessVerdict]:
        verdicts: Dict[str, InterestingnessVerdict] = {}
        for task in tasks:
            interesting = True
            rationale = "frontier task"
            for anchor, metrics in context.items():
                if metrics.attempts == 0:
                    continue
                if task in self._boring_map.get(anchor, set()):
                    interesting = False
                    rationale = f"redundant with {anchor}"
                    break
            verdicts[task] = InterestingnessVerdict(interesting=interesting, rationale=rationale)
        return verdicts


def build_stub_oracle(profiles: Iterable[Mapping[str, object]]) -> StubInterestingnessOracle:
    boring_relations: Dict[str, List[str]] = defaultdict(list)
    for profile in profiles:
        relations = profile.get("boring_relations", {})
        if isinstance(relations, Mapping):
            for anchor, neighbours in relations.items():
                if isinstance(neighbours, Iterable):
                    boring_relations[anchor].extend(str(neighbour) for neighbour in neighbours)
    return StubInterestingnessOracle(boring_relations)
