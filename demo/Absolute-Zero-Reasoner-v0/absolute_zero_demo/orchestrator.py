"""High level orchestration for the Absolute Zero Reasoner demo."""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Iterable, List

from .config import DemoConfig
from .executor import SandboxExecutor
from .guardrails import GuardrailManager
from .market import MarketSimulator
from .proposer import TaskProposer
from .reward import RewardEngine
from .solver import TaskSolver
from .telemetry import MetricSnapshot, TelemetryTracker
from .utils import Task, normalise_output, timestamp_ms


@dataclass
class LoopOutcome:
    tasks: List[Task]
    solved: int
    gross_value: float
    total_cost: float
    guardrail_events: List[str]


@dataclass
class AbsoluteZeroDemo:
    config: DemoConfig
    proposer: TaskProposer = field(init=False)
    solver: TaskSolver = field(init=False)
    executor: SandboxExecutor = field(init=False)
    reward_engine: RewardEngine = field(init=False)
    market: MarketSimulator = field(init=False)
    guardrails: GuardrailManager = field(init=False)
    telemetry: TelemetryTracker = field(init=False)

    def __post_init__(self) -> None:
        self.executor = SandboxExecutor(self.config)
        self.proposer = TaskProposer(self.config)
        self.solver = TaskSolver(self.config, self.executor)
        self.reward_engine = RewardEngine(self.config)
        self.market = MarketSimulator(self.config)
        self.guardrails = GuardrailManager(self.config)
        self.telemetry = TelemetryTracker(self.config)
        self._buffer: List[Task] = [
            Task(
                program=item["program"],
                input_payload=item["input"],
                expected_output=item["output"],
            )
            for item in self.config.seed_tasks
        ]
        self._iterations = 0

    def run_iteration(self) -> LoopOutcome:
        tasks = self.proposer.generate_batch()
        solved = 0
        total_value = 0.0
        total_cost = 0.0
        guardrail_events: List[str] = []
        diversity_score = self._diversity_score(tasks)
        for task in tasks:
            result = self.solver.solve(task)
            formatted = normalise_output(task.expected_output) == normalise_output(result.output or "")
            solved_current = result.succeeded and formatted
            economic_value = self.market.estimate_value(task, result.runtime_seconds if result.succeeded else 0.0)
            if solved_current:
                solved += 1
                self._buffer.append(task)
            proposer_reward = self.reward_engine.proposer_reward(task, solved_current)
            solver_reward = self.reward_engine.solver_reward(task, solved_current, economic_value, formatted)
            self.solver.reward_adjust(solved_current)
            total_value += economic_value
            total_cost += result.runtime_seconds * self.config.economic_assumptions.compute_cost_per_second
        success_rate = 0.0 if not tasks else solved / len(tasks)
        self.guardrails.adjust_difficulty(success_rate)
        guardrail_messages = self.guardrails.record_iteration(success_rate, diversity_score, total_cost)
        guardrail_events.extend(event.message for event in guardrail_messages)
        self.telemetry.push(
            MetricSnapshot(
                timestamp_ms=timestamp_ms(),
                tasks_proposed=len(tasks),
                tasks_solved=solved,
                gross_value=total_value,
                cost_spent=total_cost,
            )
        )
        self._iterations += 1
        return LoopOutcome(tasks, solved, total_value, total_cost, guardrail_events)

    def _diversity_score(self, tasks: Iterable[Task]) -> float:
        programs = [task.program for task in tasks]
        if len(programs) <= 1:
            return 1.0
        lengths = [len(program) for program in programs]
        variance = statistics.pvariance(lengths) if len(lengths) > 1 else 0.0
        max_len = max(lengths)
        if max_len == 0:
            return 1.0
        return max(0.0, min(1.0, variance / (max_len ** 2)))
