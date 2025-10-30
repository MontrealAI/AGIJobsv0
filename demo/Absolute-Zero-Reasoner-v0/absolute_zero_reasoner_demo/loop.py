from __future__ import annotations

import random
from dataclasses import dataclass
from typing import List

from .buffers import TaskBuffer
from .config_loader import AZRConfig
from .executor import NonDeterministicProgram, SafeExecutor, SandboxViolation
from .guardrails import GuardrailCenter
from .market import MarketSimulator
from .proposer import ProposalResult, TaskProposer
from .rewards import RewardEngine
from .solver import SolveResult, TaskSolver
from .tasks import AZRTask, IterationSummary, TaskOutcome, TaskType
from .telemetry import TelemetryRecord, TelemetryStream
from .trr import TRRController


@dataclass
class EconomicState:
    gmv_total: float = 0.0
    cost_total: float = 0.0

    @property
    def roi(self) -> float:
        return self.gmv_total - self.cost_total


class AbsoluteZeroDemo:
    def __init__(self, config: AZRConfig) -> None:
        self.config = config
        self.rng = random.Random(config.random_seed)
        buffer = TaskBuffer(max_size=config.buffers.get("max_size_per_type", 50))
        self.executor = SafeExecutor()
        self.proposer = TaskProposer(buffer=buffer, config=config.proposer, rng=self.rng)
        self.market = MarketSimulator(config.market)
        self.reward_engine = RewardEngine(config.rewards, self.market)
        self.solver = TaskSolver(self.executor, config.solver, self.rng)
        self.guardrails = GuardrailCenter(config.guardrails, self.proposer)
        telemetry_cfg = config.telemetry
        self.telemetry = TelemetryStream(
            report_path=telemetry_cfg.get("report_path", "reports/absolute_zero_reasoner_report.md"),
            json_path=telemetry_cfg.get("json_path", "reports/absolute_zero_reasoner_metrics.json"),
            mermaid_theme=telemetry_cfg.get("mermaid_theme", "forest"),
        )
        self.trr = TRRController()
        for role in ("proposer", "solver"):
            for task_type in TaskType:
                self.trr.register(role, task_type)
        self.buffer = buffer
        self.economics = EconomicState()

    def run(self) -> List[IterationSummary]:
        summaries: List[IterationSummary] = []
        for iteration in range(self.config.iterations):
            proposal = self.proposer.propose(self.config.tasks_per_iteration)
            outcomes = self._solve_tasks(proposal.tasks)
            diversity = self.buffer.diversity_score()
            success_rate = (
                sum(1 for outcome in outcomes if outcome.solved) / len(outcomes) if outcomes else 0.0
            )
            valid_rate = (
                sum(1 for outcome in outcomes if outcome.format_ok) / len(outcomes) if outcomes else 0.0
            )
            alerts = self.guardrails.check(iteration, outcomes, diversity, success_rate, valid_rate)
            summary = IterationSummary(
                index=iteration,
                tasks=outcomes,
                proposer_valid_rate=valid_rate,
                solver_success_rate=success_rate,
                diversity_score=diversity,
                sentinel_alerts=alerts,
            )
            summaries.append(summary)
            self.telemetry.append(
                TelemetryRecord(
                    iteration=iteration,
                    proposer_valid_rate=valid_rate,
                    solver_success_rate=success_rate,
                    diversity_score=diversity,
                    gmv_total=self.economics.gmv_total,
                    cost_total=self.economics.cost_total,
                    roi=self.economics.roi,
                    notes=alerts,
                )
            )
        self.telemetry.export()
        return summaries

    def _solve_tasks(self, tasks: List[AZRTask]) -> List[TaskOutcome]:
        outcomes: List[TaskOutcome] = []
        for task in tasks:
            result = self.solver.solve(task)
            self.reward_engine.update_success(task.task_type, result.solved)
            proposer_reward, solver_reward, econ_value = self.reward_engine.compute_rewards(
                task, result.solved, result.format_ok, result.output
            )
            proposer_advantage = self.trr.update("proposer", task.task_type, proposer_reward)
            solver_advantage = self.trr.update("solver", task.task_type, solver_reward)
            if solver_reward > 0:
                self.buffer.add(task)
                self.economics.gmv_total += econ_value
            self.economics.cost_total += 0.02  # approximate compute cost per task
            self.solver.adjust_accuracy(task.task_type, solver_advantage)
            outcome = TaskOutcome(
                task=task,
                proposer_reward=proposer_reward,
                solver_reward=solver_reward,
                economic_value=econ_value,
                solved=result.solved,
                solver_output=result.output,
                format_ok=result.format_ok,
            )
            outcomes.append(outcome)
        return outcomes


__all__ = ["AbsoluteZeroDemo"]
