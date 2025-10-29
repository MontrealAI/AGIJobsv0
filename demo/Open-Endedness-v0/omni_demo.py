"""Comprehensive OMNI demonstration simulator for AGI Jobs v0 (v2).

This module provides a reproducible environment that compares
Uniform, Learning-Progress-only, and OMNI curricula.  It also
exposes a high-level API that non-technical operators can call
from notebooks, CLIs, or web dashboards without touching the
internal AGI Jobs orchestrator.
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import math
import pathlib
import random
import statistics
from collections import Counter
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import yaml

try:  # pragma: no cover - optional dependency for live FM access
    import openai  # type: ignore
except Exception:  # pragma: no cover - fallback without OpenAI SDK
    openai = None


@dataclasses.dataclass
class TaskSpec:
    """Domain configuration shared across strategies.

    Attributes:
        task_id: Stable identifier used for reporting.
        label: Human readable task name.
        base_success: Starting probability of success.
        max_success: Asymptotic success rate after extensive learning.
        learning_rate: Speed at which the agent improves after each attempt.
        value: Monetary value captured on success (GMV proxy).
        similarity_tag: Semantic cluster label for MoI heuristic fallback.
    """

    task_id: str
    label: str
    base_success: float
    max_success: float
    learning_rate: float
    value: float
    similarity_tag: str


class TaskInstance:
    """Mutable simulation state for a task."""

    def __init__(self, spec: TaskSpec) -> None:
        self.spec = spec
        self.success_rate = spec.base_success
        self.attempts = 0
        self.successes = 0

    def attempt(self, rng: random.Random) -> Tuple[bool, float]:
        """Simulate an attempt against the task."""
        self.attempts += 1
        success = rng.random() < self.success_rate
        if success:
            self.successes += 1
            self.success_rate = min(
                self.spec.max_success,
                self.success_rate
                + self.spec.learning_rate * (self.spec.max_success - self.success_rate),
            )
        else:
            # Small recovery after a failure encourages retrying challenging tasks.
            self.success_rate = max(
                0.01,
                self.success_rate * (1 - 0.25 * self.spec.learning_rate),
            )
        return success, self.spec.value if success else 0.0


class LearningProgressMeter:
    """Maintains double-EMA learning progress statistics."""

    def __init__(self, fast_beta: float, slow_beta: float) -> None:
        self.fast_beta = fast_beta
        self.slow_beta = slow_beta
        self.fast_ema: Dict[str, float] = {}
        self.slow_ema: Dict[str, float] = {}
        self.lp: Dict[str, float] = {}

    def update(self, task_id: str, success_value: float) -> None:
        fast_prev = self.fast_ema.get(task_id, 0.0)
        slow_prev = self.slow_ema.get(task_id, 0.0)
        fast = self.fast_beta * success_value + (1 - self.fast_beta) * fast_prev
        slow = self.slow_beta * success_value + (1 - self.slow_beta) * slow_prev
        lp_value = max(0.0, fast - slow)
        self.fast_ema[task_id] = fast
        self.slow_ema[task_id] = slow
        self.lp[task_id] = lp_value

    def normalised_weights(self, task_ids: Iterable[str], epsilon: float = 1e-6) -> Dict[str, float]:
        raw = {task_id: self.lp.get(task_id, 0.0) + epsilon for task_id in task_ids}
        total = sum(raw.values())
        if total <= 0:
            uniform = 1.0 / max(len(raw), 1)
            return {task_id: uniform for task_id in raw}
        return {task_id: weight / total for task_id, weight in raw.items()}


class MoIClient:
    """Adapter around foundation-model or heuristic interestingness."""

    def __init__(self, prompt_path: pathlib.Path, mode: str = "heuristic") -> None:
        self.prompt_path = prompt_path
        self.mode = mode
        if mode == "openai" and openai is None:
            raise RuntimeError("openai package not available. Install openai to use mode='openai'.")

    def evaluate(self, known: Sequence[TaskSpec], candidates: Sequence[TaskSpec]) -> Dict[str, str]:
        if not candidates:
            return {}
        if self.mode == "openai":
            return self._evaluate_openai(known, candidates)
        return self._evaluate_heuristic(known, candidates)

    def _evaluate_heuristic(self, known: Sequence[TaskSpec], candidates: Sequence[TaskSpec]) -> Dict[str, str]:
        """Simple semantic clustering fallback."""
        known_tags = {task.similarity_tag for task in known}
        results: Dict[str, str] = {}
        for candidate in candidates:
            # Consider tasks interesting when they belong to a tag not yet mastered
            # or when the potential value is in the top quartile.
            if candidate.similarity_tag not in known_tags:
                results[candidate.task_id] = "Interesting"
            elif candidate.value >= self._value_percentile(candidates, 0.75):
                results[candidate.task_id] = "Interesting"
            else:
                results[candidate.task_id] = "Boring"
        return results

    @staticmethod
    def _value_percentile(tasks: Sequence[TaskSpec], percentile: float) -> float:
        values = sorted(task.value for task in tasks)
        if not values:
            return 0.0
        index = min(len(values) - 1, max(0, int(percentile * len(values)) - 1))
        return values[index]

    def _evaluate_openai(self, known: Sequence[TaskSpec], candidates: Sequence[TaskSpec]) -> Dict[str, str]:  # pragma: no cover - network side effect
        template = self.prompt_path.read_text(encoding="utf-8")
        known_lines = "\n".join(f"- {task.label}" for task in known) or "- (agent has no mastered tasks yet)"
        candidate_lines = "\n".join(f"- {task.label}" for task in candidates)
        prompt = template.replace("{{KNOWN_TASKS}}", known_lines).replace("{{CANDIDATE_TASKS}}", candidate_lines)
        completion = openai.ChatCompletion.create(  # type: ignore[attr-defined]
            model="gpt-4-0613",
            messages=[
                {"role": "system", "content": "You are an economic strategist that maximises GMV."},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
        )
        content = completion["choices"][0]["message"]["content"].strip()
        results: Dict[str, str] = {}
        for line in content.splitlines():
            if "::" not in line:
                continue
            task_label, decision = [segment.strip() for segment in line.split("::", 1)]
            matches = [task for task in candidates if task.label == task_label]
            if matches:
                results[matches[0].task_id] = decision
        return results


class OmniEngine:
    """Minimal-yet-faithful OMNI curriculum implementation for the demo."""

    def __init__(
        self,
        tasks: Sequence[TaskSpec],
        moi_client: MoIClient,
        fast_beta: float = 0.1,
        slow_beta: float = 0.01,
        interesting_weight: float = 1.0,
        boring_weight: float = 1e-6,
        min_probability: float = 1e-3,
    ) -> None:
        self.tasks = {task.task_id: task for task in tasks}
        self.meter = LearningProgressMeter(fast_beta, slow_beta)
        self.interesting_weight = interesting_weight
        self.boring_weight = boring_weight
        self.min_probability = min_probability
        self.moi_client = moi_client
        self.interesting: Dict[str, bool] = {task.task_id: True for task in tasks}
        self._last_partition_seed: Optional[str] = None

    def refresh_partition(self, mastered_tasks: Sequence[TaskSpec]) -> None:
        remaining = [task for task in self.tasks.values() if task not in mastered_tasks]
        result = self.moi_client.evaluate(mastered_tasks, remaining)
        for task in remaining:
            decision = result.get(task.task_id, "Interesting")
            self.interesting[task.task_id] = decision == "Interesting"

    def update_task_outcome(self, task_id: str, success_value: float) -> None:
        self.meter.update(task_id, success_value)

    def distribution(self) -> Dict[str, float]:
        lp_weights = self.meter.normalised_weights(self.tasks.keys())
        weighted: Dict[str, float] = {}
        for task_id, lp_weight in lp_weights.items():
            scale = self.interesting_weight if self.interesting.get(task_id, True) else self.boring_weight
            weighted[task_id] = lp_weight * scale
        total = sum(weighted.values())
        if total <= 0:
            uniform = 1.0 / len(weighted)
            return {task_id: uniform for task_id in weighted}
        normalized = {task_id: weight / total for task_id, weight in weighted.items()}
        epsilon = min(self.min_probability, 0.1)
        uniform = 1.0 / len(normalized)
        return {task_id: (1 - epsilon) * normalized[task_id] + epsilon * uniform for task_id in normalized}

    def sample_task(self, rng: random.Random) -> TaskSpec:
        dist = self.distribution()
        thresholds = []
        cumulative = 0.0
        for task_id, prob in dist.items():
            cumulative += prob
            thresholds.append((cumulative, task_id))
        draw = rng.random()
        for threshold, task_id in thresholds:
            if draw <= threshold:
                return self.tasks[task_id]
        # numerical drift fallback
        return self.tasks[thresholds[-1][1]]


class UniformStrategy:
    def __init__(self, tasks: Sequence[TaskSpec]) -> None:
        self.tasks = list(tasks)

    def select_task(self, rng: random.Random) -> TaskSpec:
        return rng.choice(self.tasks)

    def observe(self, task: TaskSpec, success_value: float) -> None:
        pass


class LearningProgressStrategy:
    def __init__(self, tasks: Sequence[TaskSpec], engine_kwargs: Optional[Dict[str, float]] = None) -> None:
        prompt = pathlib.Path(__file__).parent / "prompts" / "interestingness_prompt.md"
        kwargs = engine_kwargs or {}
        self.engine = OmniEngine(tasks, moi_client=MoIClient(prompt), **kwargs)
        for task_id in self.engine.tasks:
            self.engine.interesting[task_id] = True

    def select_task(self, rng: random.Random) -> TaskSpec:
        return self.engine.sample_task(rng)

    def observe(self, task: TaskSpec, success_value: float) -> None:
        self.engine.update_task_outcome(task.task_id, success_value)


class OmniStrategy:
    def __init__(self, tasks: Sequence[TaskSpec], moi_client: MoIClient, engine_kwargs: Optional[Dict[str, float]] = None) -> None:
        kwargs = engine_kwargs or {}
        self.engine = OmniEngine(tasks, moi_client=moi_client, **kwargs)
        self.mastered: List[TaskSpec] = []

    def select_task(self, rng: random.Random) -> TaskSpec:
        return self.engine.sample_task(rng)

    def observe(self, task: TaskSpec, success_value: float) -> bool:
        """Update learning progress and refresh MoI partitions when needed."""

        self.engine.update_task_outcome(task.task_id, success_value)
        if success_value > 0 and task not in self.mastered:
            self.mastered.append(task)
            self.engine.refresh_partition(self.mastered)
            return True
        return False


@dataclasses.dataclass
class SimulationResult:
    strategy_name: str
    total_revenue: float
    fm_cost: float
    attempts: int
    successes: int
    task_frequency: Dict[str, int]
    revenue_per_task: Dict[str, float]

    @property
    def roi(self) -> float:
        cost = max(self.fm_cost, 1e-6)
        return self.total_revenue / cost


class Simulation:
    def __init__(self, specs: Sequence[TaskSpec], seed: int = 13, engine_kwargs: Optional[Dict[str, float]] = None) -> None:
        self.specs = list(specs)
        self.seed = seed
        self.engine_kwargs = engine_kwargs or {}

    def run(
        self,
        strategy_name: str,
        strategy,
        steps: int,
        fm_cost_per_query: float = 0.02,
    ) -> SimulationResult:
        rng = random.Random(self.seed)
        tasks = {spec.task_id: TaskInstance(spec) for spec in self.specs}
        task_frequency: Counter[str] = Counter()
        revenue_per_task: Counter[str] = Counter()
        successes = 0
        fm_queries = 0
        for _ in range(steps):
            task_spec = strategy.select_task(rng)
            task = tasks[task_spec.task_id]
            success, revenue = task.attempt(rng)
            task_frequency[task_spec.task_id] += 1
            if success:
                successes += 1
            revenue_per_task[task_spec.task_id] += revenue
            success_value = revenue if success else 0.0
            if isinstance(strategy, OmniStrategy):
                refreshed = strategy.observe(task_spec, success_value)
                if refreshed:
                    fm_queries += 1
            else:
                strategy.observe(task_spec, success_value)
        fm_cost = fm_queries * fm_cost_per_query
        return SimulationResult(
            strategy_name=strategy_name,
            total_revenue=sum(revenue_per_task.values()),
            fm_cost=fm_cost,
            attempts=steps,
            successes=successes,
            task_frequency=dict(task_frequency),
            revenue_per_task=dict(revenue_per_task),
        )


def baseline_tasks() -> List[TaskSpec]:
    return [
        TaskSpec("cta_opt", "Optimise CTA copy", 0.05, 0.40, 0.08, 1200.0, "growth-copy"),
        TaskSpec("discount_target", "Calibrate personalised discount", 0.02, 0.35, 0.06, 3500.0, "pricing"),
        TaskSpec("talent_match", "Auto-match candidate to role", 0.04, 0.50, 0.05, 4200.0, "matching"),
        TaskSpec("interview_flow", "Automate interview scheduling", 0.07, 0.55, 0.07, 3100.0, "ops"),
        TaskSpec("follow_up", "Predictive follow-up messaging", 0.08, 0.60, 0.05, 900.0, "growth-copy"),
        TaskSpec("salary_signal", "Market-aligned salary suggestions", 0.03, 0.45, 0.05, 3800.0, "pricing"),
    ]

def main(argv: Optional[Sequence[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Run the OMNI curriculum demonstration simulator.")
    parser.add_argument("--config", type=pathlib.Path, default=pathlib.Path(__file__).with_name("omni_config.yaml"), help="Path to configuration YAML")
    parser.add_argument("--steps", type=int, default=750, help="Number of task selections to simulate")
    parser.add_argument("--seed", type=int, default=13, help="Deterministic random seed")
    parser.add_argument("--output", type=pathlib.Path, default=None, help="Optional JSON file to store metrics")
    args = parser.parse_args(argv)
    config = load_config(args.config)
    steps = config.get("curriculum", {}).get("steps", args.steps)
    seed = config.get("curriculum", {}).get("seed", args.seed)
    fm_cost = config.get("curriculum", {}).get("fm_cost_per_query", 0.02)
    engine_kwargs = {
        "fast_beta": config.get("curriculum", {}).get("fast_beta", 0.1),
        "slow_beta": config.get("curriculum", {}).get("slow_beta", 0.01),
        "interesting_weight": config.get("curriculum", {}).get("interesting_weight", 1.0),
        "boring_weight": config.get("curriculum", {}).get("boring_weight", 1e-6),
        "min_probability": config.get("curriculum", {}).get("min_probability", 1e-3),
    }
    prompt_path = pathlib.Path(__file__).parent / "prompts" / "interestingness_prompt.md"
    specs = tasks_from_config(config) or baseline_tasks()
    sim = Simulation(specs, seed=seed, engine_kwargs=engine_kwargs)
    results = [
        sim.run("Uniform", UniformStrategy(specs), steps, fm_cost_per_query=fm_cost),
        sim.run(
            "Learning Progress",
            LearningProgressStrategy(specs, engine_kwargs=engine_kwargs),
            steps,
            fm_cost_per_query=fm_cost,
        ),
        sim.run(
            "OMNI",
            OmniStrategy(specs, moi_client=MoIClient(prompt_path, mode="heuristic"), engine_kwargs=engine_kwargs),
            steps,
            fm_cost_per_query=fm_cost,
        ),
    ]
    table = [[
        result.strategy_name,
        f"$ {result.total_revenue:,.2f}",
        f"$ {result.fm_cost:,.2f}",
        f"{result.roi:,.1f}x",
    ] for result in results]
    headers = ["Strategy", "Total GMV", "FM Spend", "ROI"]
    print("\nOMNI DEMO PERFORMANCE\n======================")
    print(_format_table(headers, table))
    output_path = args.output or pathlib.Path(config.get("reporting", {}).get("save_json", ""))
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            result.strategy_name: {**dataclasses.asdict(result), "roi": result.roi}
            for result in results
        }
        output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"\nSaved metrics to {output_path}")


def load_config(path: pathlib.Path) -> Dict:
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def tasks_from_config(config: Dict) -> List[TaskSpec]:
    tasks_cfg = config.get("tasks")
    if not tasks_cfg:
        return []
    specs = []
    for item in tasks_cfg:
        specs.append(
            TaskSpec(
                task_id=item["task_id"],
                label=item.get("label", item["task_id"]),
                base_success=item.get("base_success", 0.05),
                max_success=item.get("max_success", 0.5),
                learning_rate=item.get("learning_rate", 0.05),
                value=item.get("value", 1000.0),
                similarity_tag=item.get("similarity_tag", item["task_id"]),
            )
        )
    return specs


def _format_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> str:
    widths = [max(len(str(cell)) for cell in column) for column in zip(headers, *rows)]
    header_line = " | ".join(str(cell).ljust(width) for cell, width in zip(headers, widths))
    separator = "-+-".join("-" * width for width in widths)
    body_lines = [" | ".join(str(cell).ljust(width) for cell, width in zip(row, widths)) for row in rows]
    return "\n".join([header_line, separator, *body_lines])


if __name__ == "__main__":
    main()
