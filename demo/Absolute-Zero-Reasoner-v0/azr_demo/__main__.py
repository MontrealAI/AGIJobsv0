"""Absolute Zero Reasoner v0 self-play demo orchestration."""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Callable, Dict, Iterable, Optional

from .economic import EconomicSimulator
from .executor import SandboxViolation, SafeExecutor
from .guardrails import GuardrailManager
from .policy import TRRPlusPlusPolicy
from .reward import RewardEngine
from .solver import SelfImprovingSolver, SolverError
from .tasks import AZRTask, TaskLibrary, TaskType
from .telemetry import TelemetryTracker

DEFAULT_CONFIG: Dict[str, object] = {
    "seed": 1234,
    "runtime": {"iterations": 10, "tasks_per_iteration": 2},
    "executor": {"time_limit": 2.0, "memory_limit_mb": 256},
    "rewards": {"economic_weight": 0.15, "format_penalty": 0.6},
    "guardrails": {"target_success": 0.55, "tolerance": 0.2, "difficulty_step": 0.12},
    "policy": {"baseline_lr": 0.2, "base_temperature": 0.85},
    "economics": {"base_value": 25.0, "difficulty_multiplier": 45.0, "solver_cost": 0.05},
}


def load_config(path: Optional[Path]) -> Dict[str, object]:
    if path is None:
        return DEFAULT_CONFIG
    data = json.loads(path.read_text(encoding="utf-8"))
    merged = DEFAULT_CONFIG.copy()
    for key, value in data.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


class AbsoluteZeroReasonerDemo:
    """Executable orchestrator for the user-facing demo."""

    def __init__(
        self,
        config: Dict[str, object],
        *,
        max_seconds: float | None = None,
        progress_interval: int = 1,
        verbose: bool = True,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self.config = config
        self.max_seconds = max_seconds
        self.progress_interval = max(1, progress_interval)
        self.verbose = verbose
        self._clock = clock or time.perf_counter
        self.executor = SafeExecutor(
            time_limit=float(config["executor"]["time_limit"]),
            memory_limit_mb=int(config["executor"]["memory_limit_mb"]),
        )
        self.library = TaskLibrary(seed=int(config["seed"]))
        self.policy = TRRPlusPlusPolicy(
            baseline_lr=float(config["policy"].get("baseline_lr", 0.2)),
            base_temperature=float(config["policy"].get("base_temperature", 0.8)),
        )
        self.reward_engine = RewardEngine(
            economic_weight=float(config["rewards"].get("economic_weight", 0.1)),
            format_penalty=float(config["rewards"].get("format_penalty", 0.5)),
        )
        self.telemetry = TelemetryTracker(
            solver_cost=float(config["economics"].get("solver_cost", 0.05))
        )
        self.guardrails = GuardrailManager(
            target_success=float(config["guardrails"].get("target_success", 0.5)),
            tolerance=float(config["guardrails"].get("tolerance", 0.15)),
            difficulty_step=float(config["guardrails"].get("difficulty_step", 0.1)),
        )
        self.simulator = EconomicSimulator(
            base_value=float(config["economics"].get("base_value", 20.0)),
            difficulty_multiplier=float(
                config["economics"].get("difficulty_multiplier", 40.0)
            ),
        )
        self.solver = SelfImprovingSolver(self.executor)
        runtime = config["runtime"]
        self.iterations = int(runtime["iterations"])
        self.tasks_per_iteration = int(runtime["tasks_per_iteration"])

    def _log(self, message: str) -> None:
        if self.verbose:
            print(message, flush=True)

    def _validate_task(self, task: AZRTask) -> bool:
        try:
            result = self.executor.execute(task.program, task.input_payload)
        except SandboxViolation:
            self.guardrails.register_violation()
            return False
        except RuntimeError:
            return False
        if result.timed_out or result.non_deterministic:
            return False
        if task.task_type is TaskType.DEDUCTION:
            return result.output == task.expected_output
        if task.task_type is TaskType.ABDUCTION:
            return result.output == task.expected_output
        if task.task_type is TaskType.INDUCTION:
            for example in task.io_examples:
                expected = example["output"]
                observed = self.executor.execute(task.program, example["input"]).output
                if observed != expected:
                    return False
            return True
        return False

    def _verify_solution(self, task: AZRTask, answer: Dict[str, object]) -> bool:
        if task.task_type is TaskType.DEDUCTION:
            candidate = answer.get("answer")
            expected = self.executor.execute(task.program, task.input_payload).output
            return candidate == expected
        if task.task_type is TaskType.ABDUCTION:
            candidate = answer.get("answer")
            if candidate is None:
                return False
            payload = {"target": candidate}
            result = self.executor.execute(task.program, payload)
            return result.output == task.expected_output
        if task.task_type is TaskType.INDUCTION:
            program = answer.get("program")
            if not isinstance(program, str):
                return False
            for example in task.io_examples:
                result = self.executor.execute(program, example["input"])
                if result.output != example["output"]:
                    return False
            return True
        return False

    def run(self) -> Dict[str, object]:
        start_time = self._clock()
        iteration = 0
        while iteration < self.iterations and not self.guardrails.should_pause():
            if self.max_seconds is not None:
                elapsed = self._clock() - start_time
                if elapsed >= self.max_seconds:
                    self.guardrails.pause()
                    self._log(
                        f"⏱️  Wall-clock limit reached after {elapsed:.2f}s; stopping early."
                    )
                    break
            iteration += 1
            batch = self.library.sample(
                count=self.tasks_per_iteration,
                difficulty_bias=self.guardrails.state.difficulty_bias,
            )
            for task in batch:
                if not self._validate_task(task):
                    continue
                start = time.perf_counter()
                temperature = self.policy.current_temperature("solver", task.task_type)
                try:
                    answer, format_ok = self.solver.solve(task, temperature=temperature)
                except SolverError:
                    self.guardrails.register_violation()
                    continue
                latency = time.perf_counter() - start
                success = False
                if format_ok:
                    try:
                        success = self._verify_solution(task, answer)
                    except (SandboxViolation, RuntimeError):
                        self.guardrails.register_violation()
                        format_ok = False
                economic_value = self.simulator.estimate(
                    task, success=success, latency=latency
                )
                rewards = self.reward_engine.compute(
                    task_type=task.task_type,
                    solver_success=success,
                    economic_value=economic_value,
                    format_ok=format_ok,
                )
                solver_metrics = self.policy.record(
                    "solver", task.task_type, rewards.total_solver_reward
                )
                self.solver.update_error_rate(task.task_type, solver_metrics["advantage"])
                self.policy.record("proposer", task.task_type, rewards.proposer_reward)
                self.telemetry.record(
                    iteration=iteration,
                    task_identifier=task.identifier,
                    task_type=task.task_type,
                    proposer_reward=rewards.proposer_reward,
                    solver_reward=rewards.total_solver_reward,
                    economic_value=economic_value,
                    success=success,
                )
            aggregates = self.telemetry.aggregates()
            self.guardrails.register_iteration(aggregates.get("success_rate", 0.0))
            if iteration % self.progress_interval == 0:
                self._log(
                    "→ iteration {iter}: success_rate={success:.2f} gmv={gmv:.2f} "
                    "roi={roi:.2f}".format(
                        iter=iteration,
                        success=aggregates.get("success_rate", 0.0),
                        gmv=aggregates.get("gmv_total", 0.0),
                        roi=aggregates.get("roi", 0.0),
                    )
                )
        payload = {
            "config": self.config,
            "policy": self.policy.snapshot(),
            "rewards": self.reward_engine.snapshot(),
            "guardrails": self.guardrails.snapshot(),
            "telemetry": self.telemetry.aggregates(),
            "timeline": self.telemetry.timeline(),
        }
        return payload


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        type=Path,
        help="Optional path to a JSON configuration overriding demo defaults.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path for dumping the telemetry payload as JSON.",
    )
    parser.add_argument(
        "--max-seconds",
        type=float,
        help="Optional wall-clock limit for the run to prevent long hangs.",
    )
    parser.add_argument(
        "--progress-interval",
        type=int,
        default=1,
        help="How frequently to print iteration progress (in iterations).",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress logging for non-interactive environments.",
    )
    return parser


def main(argv: Optional[Iterable[str]] = None) -> Dict[str, object]:
    parser = build_arg_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    config = load_config(args.config)
    demo = AbsoluteZeroReasonerDemo(
        config,
        max_seconds=args.max_seconds,
        progress_interval=args.progress_interval,
        verbose=not args.quiet,
    )
    payload = demo.run()
    if args.output:
        args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


if __name__ == "__main__":  # pragma: no cover
    main()
