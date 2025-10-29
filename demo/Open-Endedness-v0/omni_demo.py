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
        operational_cost: Per-attempt operational expenditure used for ROI maths.
    """

    task_id: str
    label: str
    base_success: float
    max_success: float
    learning_rate: float
    value: float
    similarity_tag: str
    operational_cost: float = 1.0


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


class EconomicLedger:
    """Persistence-lite ledger tracking attempts, spend, and ROI."""

    def __init__(self) -> None:
        self.entries: List[Dict[str, object]] = []

    def record(
        self,
        *,
        step: int,
        strategy: str,
        task: Optional[TaskSpec],
        success: bool,
        revenue: float,
        fm_cost: float,
        paused: bool = False,
    ) -> None:
        entry = {
            "step": step,
            "strategy": strategy,
            "task_id": task.task_id if task else None,
            "task_label": task.label if task else None,
            "success": success,
            "revenue": revenue,
            "operational_cost": (task.operational_cost if task else 0.0),
            "fm_cost": fm_cost,
            "paused": paused,
        }
        self.entries.append(entry)

    def task_summary(self) -> Dict[str, Dict[str, float]]:
        summary: Dict[str, Dict[str, float]] = {}
        for entry in self.entries:
            task_id = entry.get("task_id")
            if task_id is None:
                continue
            stats = summary.setdefault(
                task_id,
                {
                    "label": entry.get("task_label", ""),
                    "attempts": 0.0,
                    "successes": 0.0,
                    "revenue": 0.0,
                    "operational_cost": 0.0,
                    "fm_cost": 0.0,
                },
            )
            stats["attempts"] += 1
            stats["successes"] += 1 if entry.get("success") else 0.0
            stats["revenue"] += float(entry.get("revenue", 0.0))
            stats["operational_cost"] += float(entry.get("operational_cost", 0.0))
            stats["fm_cost"] += float(entry.get("fm_cost", 0.0))
        for stats in summary.values():
            cost = stats["operational_cost"] + stats["fm_cost"]
            stats["roi"] = stats["revenue"] / max(cost, 1e-6)
            stats["success_rate"] = (
                stats["successes"] / max(stats["attempts"], 1e-6)
            )
        return summary

    def totals(self) -> Dict[str, float]:
        revenue = sum(float(entry.get("revenue", 0.0)) for entry in self.entries)
        operational_cost = sum(float(entry.get("operational_cost", 0.0)) for entry in self.entries)
        fm_cost = sum(float(entry.get("fm_cost", 0.0)) for entry in self.entries)
        total_cost = operational_cost + fm_cost
        return {
            "revenue": revenue,
            "operational_cost": operational_cost,
            "fm_cost": fm_cost,
            "total_cost": total_cost,
            "roi_total": revenue / max(total_cost, 1e-6),
            "roi_fm": revenue / max(fm_cost, 1e-6),
        }

    def paused_steps(self) -> int:
        return sum(1 for entry in self.entries if entry.get("paused"))


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
        self._disabled: Dict[str, bool] = {task.task_id: False for task in tasks}
        self._last_partition_seed: Optional[str] = None

    def refresh_partition(self, mastered_tasks: Sequence[TaskSpec]) -> None:
        remaining = [task for task in self.tasks.values() if task not in mastered_tasks]
        result = self.moi_client.evaluate(mastered_tasks, remaining)
        for task in remaining:
            decision = result.get(task.task_id, "Interesting")
            self.interesting[task.task_id] = decision == "Interesting"

    def set_task_enabled(self, task_id: str, enabled: bool) -> None:
        if task_id in self._disabled:
            self._disabled[task_id] = not enabled

    def enabled_tasks(self) -> List[str]:
        enabled = [task_id for task_id, disabled in self._disabled.items() if not disabled]
        return enabled or list(self.tasks.keys())

    def update_task_outcome(self, task_id: str, success_value: float) -> None:
        self.meter.update(task_id, success_value)

    def distribution(self) -> Dict[str, float]:
        eligible = self.enabled_tasks()
        lp_weights = self.meter.normalised_weights(eligible)
        weighted: Dict[str, float] = {}
        for task_id in self.tasks:
            if self._disabled.get(task_id, False):
                weighted[task_id] = 0.0
                continue
            lp_weight = lp_weights.get(task_id, 0.0)
            scale = self.interesting_weight if self.interesting.get(task_id, True) else self.boring_weight
            weighted[task_id] = lp_weight * scale
        total = sum(weighted.values())
        enabled_count = len([task_id for task_id in self.tasks if not self._disabled.get(task_id, False)])
        if enabled_count == 0:
            enabled_count = len(self.tasks)
        if total <= 0:
            uniform = 1.0 / max(enabled_count, 1)
            distribution = {task_id: (0.0 if self._disabled.get(task_id, False) else uniform) for task_id in self.tasks}
            return distribution
        normalized = {task_id: (weight / total) if not self._disabled.get(task_id, False) else 0.0 for task_id, weight in weighted.items()}
        epsilon = min(self.min_probability, 0.1)
        uniform = 1.0 / max(enabled_count, 1)
        adjusted: Dict[str, float] = {}
        for task_id in self.tasks:
            if self._disabled.get(task_id, False):
                adjusted[task_id] = 0.0
            else:
                adjusted[task_id] = (1 - epsilon) * normalized[task_id] + epsilon * uniform
        return adjusted

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
        newly_mastered = False
        if success_value > 0 and task not in self.mastered:
            self.mastered.append(task)
            newly_mastered = True
        return newly_mastered


class OwnerControls:
    """Allows contract owners to pause or retune the curriculum."""

    def __init__(self, config: Optional[Dict[str, object]] = None) -> None:
        cfg = config or {}
        self.pause_windows: List[Tuple[int, int]] = []
        for window in cfg.get("pause_windows", []):
            start = int(window.get("start", 0))
            end = int(window.get("end", start))
            if end < start:
                start, end = end, start
            self.pause_windows.append((start, end))
        self.weight_schedule: List[Dict[str, float]] = []
        for schedule in cfg.get("weight_schedule", []):
            parsed = {key: float(value) for key, value in schedule.items() if key != "step"}
            parsed["step"] = int(schedule.get("step", 0))
            self.weight_schedule.append(parsed)
        self._applied_steps: set[int] = set()
        self.events: List[Dict[str, object]] = []
        self._pause_active = False

    def is_paused(self, step: int) -> bool:
        return any(start <= step <= end for start, end in self.pause_windows)

    def apply_weight_overrides(self, engine: OmniEngine, step: int) -> Optional[Dict[str, object]]:
        event: Optional[Dict[str, object]] = None
        for schedule in self.weight_schedule:
            schedule_step = int(schedule.get("step", 0))
            if schedule_step == step and schedule_step not in self._applied_steps:
                self._applied_steps.add(schedule_step)
                changes: Dict[str, float] = {}
                if "interesting_weight" in schedule:
                    engine.interesting_weight = float(schedule["interesting_weight"])
                    changes["interesting_weight"] = engine.interesting_weight
                if "boring_weight" in schedule:
                    engine.boring_weight = float(schedule["boring_weight"])
                    changes["boring_weight"] = engine.boring_weight
                if "min_probability" in schedule:
                    engine.min_probability = float(schedule["min_probability"])
                    changes["min_probability"] = engine.min_probability
                if changes:
                    event = {"step": step, "action": "owner_override", "changes": changes}
        return event

    def process_pause(self, step: int) -> Tuple[bool, List[Dict[str, object]]]:
        paused = self.is_paused(step)
        events: List[Dict[str, object]] = []
        if paused and not self._pause_active:
            self._pause_active = True
            events.append({"step": step, "action": "owner_pause_start"})
        elif not paused and self._pause_active:
            self._pause_active = False
            events.append({"step": step, "action": "owner_pause_end"})
        return paused, events


class ThermostatController:
    """Adjusts OMNI parameters based on economic telemetry."""

    def __init__(self, config: Optional[Dict[str, object]] = None) -> None:
        cfg = config or {}
        self.roi_target = float(cfg.get("roi_target", 8.0))
        self.roi_floor = float(cfg.get("roi_floor", 3.0))
        self.fm_budget = float(cfg.get("fm_budget_usd", 1_000.0))
        self.diversity_entropy_floor = float(cfg.get("diversity_entropy_floor", 1.0))
        bounds = cfg.get("exploration_epsilon_bounds", [0.01, 0.15])
        self.epsilon_bounds = (float(bounds[0]), float(bounds[1]) if len(bounds) > 1 else float(bounds[0]))
        self.epsilon_state = self.epsilon_bounds[0]
        self.events: List[Dict[str, object]] = []
        self.fm_spend = 0.0

    def register_fm_spend(self, cost: float) -> None:
        self.fm_spend += cost

    def fm_budget_remaining(self) -> float:
        return max(0.0, self.fm_budget - self.fm_spend)

    def adjust(
        self,
        *,
        engine: OmniEngine,
        ledger: EconomicLedger,
        distribution: Dict[str, float],
        step: int,
    ) -> Optional[Dict[str, object]]:
        totals = ledger.totals()
        roi_fm = totals["roi_fm"]
        entropy = -sum(prob * math.log(prob + 1e-12) for prob in distribution.values() if prob > 0)
        action: Optional[Dict[str, object]] = None
        if roi_fm < self.roi_floor:
            old_weight = engine.interesting_weight
            engine.interesting_weight = max(0.35, engine.interesting_weight * 0.9)
            engine.min_probability = min(0.25, engine.min_probability * 1.5)
            action = {
                "step": step,
                "action": "thermostat_roi_floor",
                "roi_fm": roi_fm,
                "interesting_weight": engine.interesting_weight,
                "min_probability": engine.min_probability,
                "prev_interesting_weight": old_weight,
            }
        elif roi_fm > self.roi_target:
            old_weight = engine.interesting_weight
            engine.interesting_weight = min(2.0, engine.interesting_weight * 1.05)
            engine.min_probability = max(0.0005, engine.min_probability * 0.7)
            action = {
                "step": step,
                "action": "thermostat_roi_boost",
                "roi_fm": roi_fm,
                "interesting_weight": engine.interesting_weight,
                "min_probability": engine.min_probability,
                "prev_interesting_weight": old_weight,
            }
        if entropy < self.diversity_entropy_floor:
            self.epsilon_state = min(self.epsilon_bounds[1], self.epsilon_state + 0.01)
            engine.min_probability = min(0.3, engine.min_probability + self.epsilon_state)
            entropy_event = {
                "step": step,
                "action": "thermostat_entropy_guard",
                "entropy": entropy,
                "epsilon_state": self.epsilon_state,
                "min_probability": engine.min_probability,
            }
            self.events.append(entropy_event)
        if action:
            self.events.append(action)
        return action


class SentinelSuite:
    """Hard guardrails against degenerate or unprofitable behaviour."""

    def __init__(
        self,
        config: Optional[Dict[str, object]] = None,
        *,
        qps_limit: Optional[float] = None,
        fm_cost_per_query: float,
    ) -> None:
        cfg = config or {}
        self.task_roi_floor = float(cfg.get("task_roi_floor", 1.0))
        self.overall_roi_floor = float(cfg.get("overall_roi_floor", 2.0))
        self.max_new_tasks_daily = int(cfg.get("max_new_tasks_daily", 10_000))
        self.fm_daily_cap = int(cfg.get("fm_daily_cap", 10_000))
        self.allow_manual_overrides = bool(cfg.get("allow_manual_overrides", True))
        overrides = cfg.get("manual_overrides", {}) if isinstance(cfg.get("manual_overrides", {}), dict) else {}
        self.manual_disable = set(overrides.get("disable", []))
        self.manual_enable = set(overrides.get("enable", []))
        self.events: List[Dict[str, object]] = []
        self.disabled_tasks: set[str] = set(self.manual_disable)
        self.fm_queries = 0
        self.mastered_count = 0
        self.fm_cost_per_query = fm_cost_per_query
        self.min_step_gap = max(1, int(1 / qps_limit)) if qps_limit and qps_limit > 0 else 1
        self.last_fm_step: Optional[int] = None

    def apply_manual_overrides(self, engine: OmniEngine) -> None:
        if not self.allow_manual_overrides:
            return
        for task_id in self.manual_disable:
            engine.set_task_enabled(task_id, False)
        for task_id in self.manual_enable:
            engine.set_task_enabled(task_id, True)

    def can_issue_fm_query(self, step: int, thermostat: ThermostatController) -> bool:
        if self.fm_queries >= self.fm_daily_cap:
            self.events.append({"step": step, "action": "sentinel_fm_cap"})
            return False
        if self.mastered_count >= self.max_new_tasks_daily:
            self.events.append({"step": step, "action": "sentinel_new_task_cap"})
            return False
        if thermostat.fm_budget_remaining() < self.fm_cost_per_query:
            self.events.append({"step": step, "action": "sentinel_budget_lock"})
            return False
        if self.last_fm_step is not None and step - self.last_fm_step < self.min_step_gap:
            self.events.append({"step": step, "action": "sentinel_qps_hold"})
            return False
        return True

    def register_fm_query(self, step: int) -> None:
        self.fm_queries += 1
        self.mastered_count += 1
        self.last_fm_step = step

    def evaluate(self, engine: OmniEngine, ledger: EconomicLedger, step: int) -> List[Dict[str, object]]:
        events: List[Dict[str, object]] = []
        totals = ledger.totals()
        if totals["roi_total"] < self.overall_roi_floor:
            events.append({"step": step, "action": "sentinel_overall_roi_floor", "roi_total": totals["roi_total"]})
        summary = ledger.task_summary()
        for task_id, stats in summary.items():
            if stats["roi"] < self.task_roi_floor and task_id not in self.disabled_tasks:
                self.disabled_tasks.add(task_id)
                events.append({"step": step, "action": "sentinel_disable_task", "task_id": task_id, "roi": stats["roi"]})
        for task_id in list(self.disabled_tasks):
            engine.set_task_enabled(task_id, False)
        self.events.extend(events)
        return events

@dataclasses.dataclass
class SimulationResult:
    strategy_name: str
    total_revenue: float
    fm_cost: float
    attempts: int
    successes: int
    task_frequency: Dict[str, int]
    revenue_per_task: Dict[str, float]
    operational_cost: float
    total_cost: float
    ledger_snapshot: Dict[str, Dict[str, float]]
    thermostat_events: List[Dict[str, object]]
    sentinel_events: List[Dict[str, object]]
    owner_events: List[Dict[str, object]]
    paused_steps: int

    @property
    def roi(self) -> float:
        return self.total_revenue / max(self.total_cost, 1e-6)

    @property
    def roi_fm(self) -> float:
        return self.total_revenue / max(self.fm_cost, 1e-6)


class Simulation:
    def __init__(
        self,
        specs: Sequence[TaskSpec],
        seed: int = 13,
        engine_kwargs: Optional[Dict[str, float]] = None,
        config: Optional[Dict[str, object]] = None,
    ) -> None:
        self.specs = list(specs)
        self.seed = seed
        self.engine_kwargs = engine_kwargs or {}
        self.config = config or {}

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
        attempts = 0
        ledger = EconomicLedger()
        thermostat: Optional[ThermostatController] = None
        sentinel: Optional[SentinelSuite] = None
        owner_controls: Optional[OwnerControls] = None
        if isinstance(strategy, OmniStrategy):
            thermostat_cfg = self.config.get("thermostat", {})
            sentinel_cfg = self.config.get("sentinels", {})
            owner_cfg = self.config.get("owner_controls", {})
            thermostat = ThermostatController(thermostat_cfg)
            sentinel = SentinelSuite(
                sentinel_cfg,
                qps_limit=thermostat_cfg.get("qps_max"),
                fm_cost_per_query=fm_cost_per_query,
            )
            owner_controls = OwnerControls(owner_cfg)
            sentinel.apply_manual_overrides(strategy.engine)
        for step in range(1, steps + 1):
            if owner_controls:
                event = owner_controls.apply_weight_overrides(strategy.engine, step)
                if event:
                    owner_controls.events.append(event)
                paused, pause_events = owner_controls.process_pause(step)
                owner_controls.events.extend(pause_events)
                if paused:
                    ledger.record(
                        step=step,
                        strategy=strategy_name,
                        task=None,
                        success=False,
                        revenue=0.0,
                        fm_cost=0.0,
                        paused=True,
                    )
                    continue
            task_spec = strategy.select_task(rng)
            task = tasks[task_spec.task_id]
            success, revenue = task.attempt(rng)
            attempts += 1
            task_frequency[task_spec.task_id] += 1
            revenue_per_task[task_spec.task_id] += revenue
            if success:
                successes += 1
            success_value = revenue if success else 0.0
            fm_cost_entry = 0.0
            if isinstance(strategy, OmniStrategy):
                refreshed = strategy.observe(task_spec, success_value)
                if refreshed:
                    allow_refresh = True
                    if sentinel and thermostat:
                        allow_refresh = sentinel.can_issue_fm_query(step, thermostat)
                    if allow_refresh:
                        strategy.engine.refresh_partition(strategy.mastered)
                        fm_cost_entry = fm_cost_per_query
                        if thermostat:
                            thermostat.register_fm_spend(fm_cost_entry)
                        if sentinel:
                            sentinel.register_fm_query(step)
            else:
                strategy.observe(task_spec, success_value)
            ledger.record(
                step=step,
                strategy=strategy_name,
                task=task_spec,
                success=success,
                revenue=revenue,
                fm_cost=fm_cost_entry,
            )
            if isinstance(strategy, OmniStrategy):
                distribution = strategy.engine.distribution()
                if thermostat:
                    thermostat.adjust(engine=strategy.engine, ledger=ledger, distribution=distribution, step=step)
                if sentinel:
                    sentinel.evaluate(strategy.engine, ledger, step)
        totals = ledger.totals()
        return SimulationResult(
            strategy_name=strategy_name,
            total_revenue=totals["revenue"],
            fm_cost=totals["fm_cost"],
            attempts=attempts,
            successes=successes,
            task_frequency=dict(task_frequency),
            revenue_per_task=dict(revenue_per_task),
            operational_cost=totals["operational_cost"],
            total_cost=totals["total_cost"],
            ledger_snapshot=ledger.task_summary(),
            thermostat_events=thermostat.events if thermostat else [],
            sentinel_events=sentinel.events if sentinel else [],
            owner_events=owner_controls.events if owner_controls else [],
            paused_steps=ledger.paused_steps(),
        )


def baseline_tasks() -> List[TaskSpec]:
    return [
        TaskSpec("cta_opt", "Optimise CTA copy", 0.05, 0.40, 0.08, 1200.0, "growth-copy", 120.0),
        TaskSpec("discount_target", "Calibrate personalised discount", 0.02, 0.35, 0.06, 3500.0, "pricing", 260.0),
        TaskSpec("talent_match", "Auto-match candidate to role", 0.04, 0.50, 0.05, 4200.0, "matching", 320.0),
        TaskSpec("interview_flow", "Automate interview scheduling", 0.07, 0.55, 0.07, 3100.0, "ops", 210.0),
        TaskSpec("follow_up", "Predictive follow-up messaging", 0.08, 0.60, 0.05, 900.0, "growth-copy", 80.0),
        TaskSpec("salary_signal", "Market-aligned salary suggestions", 0.03, 0.45, 0.05, 3800.0, "pricing", 240.0),
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
    sim = Simulation(specs, seed=seed, engine_kwargs=engine_kwargs, config=config)
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
        f"$ {result.operational_cost:,.2f}",
        f"$ {result.fm_cost:,.2f}",
        f"{result.roi:,.2f}x",
        f"{result.roi_fm:,.2f}x",
    ] for result in results]
    headers = ["Strategy", "Total GMV", "Operational Spend", "FM Spend", "ROI (Total)", "ROI (FM)"]
    print("\nOMNI DEMO PERFORMANCE\n======================")
    print(_format_table(headers, table))
    output_path = args.output or pathlib.Path(config.get("reporting", {}).get("save_json", ""))
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            result.strategy_name: {
                **dataclasses.asdict(result),
                "roi_total": result.roi,
                "roi_fm": result.roi_fm,
            }
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
                operational_cost=item.get("operational_cost", 1.0),
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
