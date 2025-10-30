"""Core OMNI curriculum engine for the open-endedness demo.

This module provides a production-quality yet lightweight implementation of the
learning progress (LP) + Model-of-Interestingness (MoI) curriculum described in
Zhang et al. 2023 (OMNI).  It is intentionally self contained so that the
simulation, notebooks and external services used in the demo can share the same
engine without pulling in the heavier AGI Jobs runtime.

The implementation focuses on:
  * Double exponential moving averages for LP estimation.
  * Algorithm 1 partitioning that tags tasks as interesting or boring.
  * Sampling that combines LP and MoI weights with temperature and minimum
    probability guardrails so that even boring tasks occasionally receive
    attention (important for catastrophic forgetting mitigation).
  * Deterministic behaviour when a random.Random instance is provided, enabling
    reproducible simulations and deterministic tests.

The engine is deliberately typed and documented so that non-technical operators
can safely script against it while power users can extend it for bespoke
research experiments.
"""
from __future__ import annotations

import dataclasses
import logging
import math
import random
from collections import defaultdict
from typing import Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence, Set, Tuple

logger = logging.getLogger(__name__)


@dataclasses.dataclass
class TaskState:
    """Container for per-task learning progress state."""

    fast_ema: float = 0.0
    slow_ema: float = 0.0
    learning_progress: float = 0.0
    successes: int = 0
    attempts: int = 0
    interesting: bool = True
    last_partition_context: Optional[str] = None

    def record_outcome(self, success: float) -> None:
        self.successes += int(success > 0.0)
        self.attempts += 1

    @property
    def success_rate(self) -> float:
        if self.attempts == 0:
            return 0.0
        return self.successes / self.attempts


class ModelOfInterestingness:
    """Interface for interestingness judgments.

    The default implementation is heuristic to keep the demo fully offline.
    Integrators can subclass this interface and override :meth:`label_tasks`
    to connect to a foundation model hosted on e.g. OpenAI, Azure OpenAI or
    Anthropic.  Because the OMNI paper advocates batching, the API accepts a
    sequence of candidate task descriptions and returns a mapping to boolean
    interesting flags.
    """

    def __init__(
        self,
        boring_weight: float = 1e-3,
        interesting_weight: float = 1.0,
        overlap_threshold: float = 0.6,
    ):
        self.boring_weight = boring_weight
        self.interesting_weight = interesting_weight
        if not 0.0 <= overlap_threshold <= 1.0:
            raise ValueError("overlap_threshold must be between 0 and 1")
        self.overlap_threshold = overlap_threshold

    def label_tasks(
        self,
        mastered_tasks: Sequence[str],
        candidate_tasks: Mapping[str, str],
    ) -> Mapping[str, Tuple[bool, Optional[str]]]:
        """Label tasks as interesting/boring.

        Args:
            mastered_tasks: High-performing task descriptions.
            candidate_tasks: Mapping of task_id -> human readable description.

        Returns:
            Mapping of task_id -> (is_interesting, explanation).
        """

        mastered_tokens = {
            token
            for description in mastered_tasks
            for token in description.lower().split()
        }
        result: Dict[str, Tuple[bool, Optional[str]]] = {}
        for task_id, description in candidate_tasks.items():
            desc_tokens = set(description.lower().split())
            overlap = mastered_tokens.intersection(desc_tokens)
            if not mastered_tasks:
                result[task_id] = (True, None)
            elif description.lower() in {d.lower() for d in mastered_tasks}:
                result[task_id] = (False, "Exact duplicate of mastered task")
            elif len(overlap) / max(len(desc_tokens), 1) > self.overlap_threshold:
                reason = "Shares >60% vocabulary with mastered tasks"
                result[task_id] = (False, reason)
            else:
                result[task_id] = (True, None)
        return result

    def weight_for(self, is_interesting: bool) -> float:
        return self.interesting_weight if is_interesting else self.boring_weight


class OmniCurriculumEngine:
    """OMNI sampling engine combining LP and MoI."""

    def __init__(
        self,
        task_descriptions: Mapping[str, str],
        fast_beta: float = 0.1,
        slow_beta: float = 0.01,
        min_probability: float = 1e-3,
        moi_client: Optional[ModelOfInterestingness] = None,
        rng: Optional[random.Random] = None,
    ) -> None:
        if not 0 < slow_beta < fast_beta < 1:
            raise ValueError("Require 0 < slow_beta < fast_beta < 1")
        self.task_descriptions = dict(task_descriptions)
        self.fast_beta = fast_beta
        self.slow_beta = slow_beta
        self.min_probability = min_probability
        self.moi_client = moi_client or ModelOfInterestingness()
        self.rng = rng or random.Random()
        self.tasks: Dict[str, TaskState] = defaultdict(TaskState)
        self._distribution: Dict[str, float] = {}
        self._boring_explanations: Dict[str, Optional[str]] = {}
        self._disabled_tasks: Set[str] = set()

        # Warm-up ensures every task has a baseline state.
        for task_id in self.task_descriptions:
            _ = self.tasks[task_id]
        self.refresh_partition(force=True)

    # ------------------------------------------------------------------
    # Properties & Accessors
    # ------------------------------------------------------------------
    @property
    def distribution(self) -> Mapping[str, float]:
        if not self._distribution:
            self._distribution = self._compute_distribution()
        return self._distribution

    @property
    def boring_explanations(self) -> Mapping[str, Optional[str]]:
        return dict(self._boring_explanations)

    @property
    def disabled_tasks(self) -> Set[str]:
        return set(self._disabled_tasks)

    def set_task_disabled(self, task_id: str, disabled: bool) -> None:
        if task_id not in self.tasks:
            raise KeyError(f"Unknown task_id {task_id}")
        if disabled:
            self._disabled_tasks.add(task_id)
        else:
            self._disabled_tasks.discard(task_id)
        self._distribution = {}

    # ------------------------------------------------------------------
    def update_task_outcome(self, task_id: str, success: float) -> None:
        if task_id not in self.tasks:
            raise KeyError(f"Unknown task_id {task_id}")
        state = self.tasks[task_id]
        state.record_outcome(success)
        prev_fast = state.fast_ema
        prev_slow = state.slow_ema
        state.fast_ema = self.fast_beta * success + (1 - self.fast_beta) * prev_fast
        state.slow_ema = self.slow_beta * success + (1 - self.slow_beta) * prev_slow
        state.learning_progress = max(state.fast_ema - state.slow_ema, 0.0)
        self._distribution = {}

    # ------------------------------------------------------------------
    def refresh_partition(self, force: bool = False) -> None:
        """Recompute interesting vs boring partition using Algorithm 1."""
        mastered = [
            self.task_descriptions[task_id]
            for task_id, state in self.tasks.items()
            if state.success_rate >= 0.6 and state.attempts >= 5
        ]

        if not force and not mastered:
            # No sufficiently mastered tasks yet, default everything to interesting.
            for state in self.tasks.values():
                state.interesting = True
                state.last_partition_context = None
            self._distribution = {}
            return

        labels = self.moi_client.label_tasks(
            mastered_tasks=mastered,
            candidate_tasks={tid: self.task_descriptions[tid] for tid in self.tasks},
        )
        for task_id, (is_interesting, explanation) in labels.items():
            state = self.tasks[task_id]
            state.interesting = is_interesting
            state.last_partition_context = explanation
            if not is_interesting:
                self._boring_explanations[task_id] = explanation
        self._distribution = {}

    # ------------------------------------------------------------------
    def _compute_distribution(self) -> Dict[str, float]:
        lp_values = {task_id: state.learning_progress for task_id, state in self.tasks.items()}
        max_lp = max(lp_values.values(), default=0.0)
        if max_lp == 0.0:
            weights = {task_id: 1.0 for task_id in self.tasks}
        else:
            weights = {
                task_id: (lp / max_lp) if max_lp > 0 else 0.0
                for task_id, lp in lp_values.items()
            }

        combined_weights: Dict[str, float] = {}
        for task_id, base_weight in weights.items():
            if task_id in self._disabled_tasks:
                combined_weights[task_id] = 0.0
                continue
            moi_weight = self.moi_client.weight_for(self.tasks[task_id].interesting)
            combined = base_weight * moi_weight
            combined_weights[task_id] = max(combined, self.min_probability)

        total = sum(combined_weights.values())
        if total <= 0:
            raise RuntimeError("Distribution weights degenerated to zero")
        normalised = {task_id: weight / total for task_id, weight in combined_weights.items()}
        return normalised

    # ------------------------------------------------------------------
    def sample_task(self) -> str:
        population = list(self.task_descriptions.keys())
        probabilities = [self.distribution[task_id] for task_id in population]
        choice = self.rng.choices(population, weights=probabilities, k=1)[0]
        logger.debug("Sampled %s with p=%.4f", choice, self.distribution[choice])
        return choice

    # ------------------------------------------------------------------
    def describe(self) -> List[Dict[str, object]]:
        """Return a structured summary of current OMNI state."""
        summary: List[Dict[str, object]] = []
        for task_id, state in self.tasks.items():
            summary.append(
                {
                    "task_id": task_id,
                    "description": self.task_descriptions[task_id],
                    "fast_ema": round(state.fast_ema, 4),
                    "slow_ema": round(state.slow_ema, 4),
                    "learning_progress": round(state.learning_progress, 4),
                    "success_rate": round(state.success_rate, 4),
                    "attempts": state.attempts,
                    "interesting": state.interesting,
                    "probability": round(self.distribution.get(task_id, 0.0), 4),
                    "last_partition_context": state.last_partition_context,
                }
            )
        return summary


def simulate_distribution(engine: OmniCurriculumEngine, trials: int = 10_000) -> Dict[str, float]:
    """Monte-Carlo sampling helper used in the demo notebook/tests."""
    counts: MutableMapping[str, int] = defaultdict(int)
    for _ in range(trials):
        counts[engine.sample_task()] += 1
    return {task_id: count / trials for task_id, count in counts.items()}
