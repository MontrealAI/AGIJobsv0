"""Asynchronous AlphaEvolve controller for the demo."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import List, Mapping, Optional

from .diff_engine import DiffProposal
from .evaluator import EvaluationHarness, EvaluationResult, evaluate_diff_async
from .guardrails import build_guardrails
from .llm import AlphaEvolveAgent, CandidateContext
from .program_database import ProgramDatabase, ProgramRecord
from .prompt_builder import PriorSolution, PromptBuilder
from .rollout import RolloutManager
from .telemetry import MetricsRecorder

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CandidateOutcome:
    diff: DiffProposal
    evaluation: Optional[EvaluationResult]
    accepted: bool
    guardrail_failures: List[str]
    error: Optional[Exception] = None


class AlphaEvolveController:
    def __init__(self, *, source: str, config: Mapping[str, object]) -> None:
        self._config = config
        self._harness = EvaluationHarness(source, config)
        self._agent = AlphaEvolveAgent(config)
        self._prompt_builder = PromptBuilder(config.get("prompt", {}))
        self._guardrails = build_guardrails(config.get("guardrails", {}), self._harness.baseline_metrics)
        self._rollout = RolloutManager(config.get("controller", {}))
        self._telemetry = MetricsRecorder()
        self._database = ProgramDatabase()
        baseline_record = ProgramRecord(
            program_id="baseline",
            generation=0,
            source=source,
            metrics=dict(self._harness.baseline_metrics),
            diff=None,
            parent_id=None,
            model_origin="baseline",
        )
        self._database.add(baseline_record)
        self._champion = baseline_record
        self._temperature = 0.5
        controller_cfg = config.get("controller", {})
        self._min_temperature = float(controller_cfg.get("min_temperature", 0.2))
        self._max_temperature = float(controller_cfg.get("max_temperature", 0.8))
        self._success_window = int(controller_cfg.get("success_window", 12))
        self._low_success_threshold = float(controller_cfg.get("low_success_threshold", 0.18))
        self._high_success_threshold = float(controller_cfg.get("high_success_threshold", 0.55))
        self._max_parallel = int(controller_cfg.get("max_parallel_evaluations", 4))
        self._success_history: List[bool] = []
        self._generation_logs: List[str] = []

    @property
    def champion(self) -> ProgramRecord:
        return self._champion

    @property
    def database(self) -> ProgramDatabase:
        return self._database

    @property
    def generation_logs(self) -> List[str]:
        return list(self._generation_logs)

    async def run(self, generations: int) -> ProgramRecord:
        semaphore = asyncio.Semaphore(self._max_parallel)
        for generation in range(1, generations + 1):
            generation_start = time.time()
            prompt = self._prompt_builder.build(
                current_source=self._champion.source,
                current_metrics=self._champion.metrics,
                prior_solutions=self._prior_solutions_snapshot(),
                temperature=self._temperature,
            )
            context = CandidateContext(source=self._champion.source, metrics=self._champion.metrics)
            proposals = self._agent.generate(context, temperature=self._temperature)
            prompt_hash = hash(prompt) & 0xFFFFFFFF
            for diff in proposals:
                metadata = diff.metadata or {}
                metadata['prompt_hash'] = prompt_hash
                diff.metadata = metadata
            outcomes: List[CandidateOutcome] = []

            async def _evaluate(diff: DiffProposal) -> None:
                async with semaphore:
                    try:
                        evaluation = await evaluate_diff_async(self._harness, diff)
                        guardrails_ok, failures = self._guardrails.evaluate(evaluation.metrics)
                        accepted = guardrails_ok and evaluation.metrics["Utility"] >= self._champion.metrics["Utility"] * 1.001
                        outcomes.append(
                            CandidateOutcome(diff=diff, evaluation=evaluation, accepted=accepted, guardrail_failures=failures)
                        )
                        self._telemetry.update(evaluation.metrics, generation=generation, accepted=accepted)
                    except Exception as exc:  # pragma: no cover - defensive
                        outcomes.append(CandidateOutcome(diff=diff, evaluation=None, accepted=False, guardrail_failures=[], error=exc))

            await asyncio.gather(*[_evaluate(diff) for diff in proposals])
            accepted_candidates = [outcome for outcome in outcomes if outcome.accepted and outcome.evaluation]
            if accepted_candidates:
                accepted_candidates.sort(key=lambda outcome: outcome.evaluation.metrics["Utility"], reverse=True)
                winner = accepted_candidates[0]
                new_program_id = winner.diff.identifier
                record = ProgramRecord(
                    program_id=new_program_id,
                    generation=generation,
                    source=winner.diff.apply(self._champion.source),
                    metrics=dict(winner.evaluation.metrics),
                    diff=winner.diff,
                    parent_id=self._champion.program_id,
                    model_origin=winner.diff.origin,
                )
                self._database.add(record)
                self._champion = record
                self._success_history.append(True)
                decision = self._rollout.register(record.metrics, guardrails_ok=True)
                log_line = (
                    f"Gen {generation}: accepted {record.program_id} from {record.model_origin} "
                    f"Utility={record.metrics['Utility']:.2f}, Fairness={record.metrics['Fairness']:.3f}, "
                    f"mode={decision.mode}, canary={decision.canary_percent:.0%}"
                )
                self._generation_logs.append(log_line)
            else:
                self._success_history.append(False)
                worst_failures = [failure for outcome in outcomes for failure in outcome.guardrail_failures]
                failure_note = f" guardrail failures={worst_failures}" if worst_failures else ""
                log_line = f"Gen {generation}: no candidate promoted.{failure_note}"
                self._generation_logs.append(log_line)
            self._adjust_temperature()
            generation_duration = time.time() - generation_start
            logger.info("Generation %s completed in %.2fs", generation, generation_duration)
        return self._champion

    def _prior_solutions_snapshot(self) -> List[PriorSolution]:
        records = self._database.pareto_front(["Utility", "Fairness", "Risk"])
        snapshot: List[PriorSolution] = []
        for record in records:
            if record.diff is None:
                continue
            diff_summary_lines = []
            for block in record.diff.blocks:
                diff_summary_lines.append("SEARCH: " + block.search)
                diff_summary_lines.append("REPLACE: " + block.replace)
            snapshot.append(
                PriorSolution(
                    identifier=record.program_id,
                    diff_summary="\n".join(diff_summary_lines),
                    metrics=record.metrics,
                )
            )
        return snapshot

    def _adjust_temperature(self) -> None:
        window = self._success_history[-self._success_window :]
        if not window:
            return
        success_rate = sum(1 for flag in window if flag) / len(window)
        if success_rate < self._low_success_threshold:
            self._temperature = max(self._min_temperature, self._temperature - 0.07)
        elif success_rate > self._high_success_threshold:
            self._temperature = min(self._max_temperature, self._temperature + 0.05)


__all__ = ["AlphaEvolveController"]
