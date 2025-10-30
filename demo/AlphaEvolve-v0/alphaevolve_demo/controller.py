"""AlphaEvolve controller orchestrating the generate-and-test loop."""
from __future__ import annotations

import asyncio
import json
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .agent import AlphaEvolveAgent, LocalHeuristicMutator, Proposal
from .diffing import apply_diff
from .evaluation import EvaluationHarness, EvaluationResult, MarketSimulation, SimulationConfig
from .heuristics import AgentProfile, JobListing
from .program_db import ProgramDatabase, ProgramEntry
from .sandbox import HeuristicSandbox, SandboxError
from .telemetry import MetricSnapshot, Telemetry


@dataclass
class ControllerConfig:
    max_generations: int
    baseline_metrics: dict[str, float]


class AlphaEvolveController:
    """Runs the asynchronous AlphaEvolve improvement loop."""

    def __init__(
        self,
        baseline_code: str,
        agents: Iterable[AgentProfile],
        jobs: Iterable[JobListing],
        controller_config: ControllerConfig,
        manifest_path: Path,
    ) -> None:
        self.baseline_code = baseline_code
        self.controller_config = controller_config
        self.database = ProgramDatabase()
        simulation = MarketSimulation(list(jobs), list(agents), SimulationConfig())
        self.harness = EvaluationHarness(simulation)
        self.sandbox = HeuristicSandbox()
        self.agent = AlphaEvolveAgent([LocalHeuristicMutator()])
        self.telemetry = Telemetry()
        self.manifest_path = manifest_path
        self.current_code = baseline_code
        baseline_compiled = self.sandbox.compile(self.current_code)
        baseline_metrics = self.harness.simulation.run(baseline_compiled.rank_candidates())
        self.baseline_metrics = {
            "utility": baseline_metrics.utility,
            "gmv": baseline_metrics.gmv,
            "cost": baseline_metrics.cost,
            "latency": baseline_metrics.latency,
            "fairness": baseline_metrics.fairness,
        }
        self.current_metrics: EvaluationResult | None = baseline_metrics
        self.database.add(
            ProgramEntry(
                generation=-1,
                code=self.current_code,
                diff="<baseline>",
                metrics=baseline_metrics,
                origin="baseline",
                niche="utility",
            )
        )
        self.telemetry.record_generation(
            -1,
            MetricSnapshot.from_result(baseline_metrics, generation=-1),
        )

    async def run(self) -> None:
        for generation in range(self.controller_config.max_generations):
            proposals = await self.agent.generate(self.current_code, generation)
            for proposal in proposals:
                await self._evaluate_proposal(generation, proposal)
        self._persist_summary()

    async def _evaluate_proposal(self, generation: int, proposal: Proposal) -> None:
        try:
            candidate_code = apply_diff(self.current_code, proposal.diff_text)
        except ValueError as exc:
            self.telemetry.log_event(f"Diff application failed: {exc}")
            return

        try:
            compiled = self.sandbox.compile(candidate_code)
        except SandboxError as exc:
            self.telemetry.log_event(f"Sandbox rejection: {exc}")
            return

        candidate_metrics = await self.harness.evaluate(compiled.rank_candidates())
        if candidate_metrics.fairness < self.harness.simulation.config.fairness_floor:
            self.telemetry.log_event(
                "Guardrail breach: fairness below floor; candidate rejected"
            )
            return
        if candidate_metrics.latency > self.harness.simulation.config.latency_slo:
            self.telemetry.log_event(
                "Guardrail breach: latency exceeds SLO; candidate rejected"
            )
            return
        if candidate_metrics.utility < self.baseline_metrics["utility"] * 0.95:
            self.telemetry.log_event(
                "Guardrail breach: utility regression detected; candidate rejected"
            )
            return
        self.telemetry.record_generation(
            generation,
            MetricSnapshot.from_result(candidate_metrics, generation=generation),
        )

        entry = ProgramEntry(
            generation=generation,
            code=candidate_code,
            diff=proposal.diff_text,
            metrics=candidate_metrics,
            origin=proposal.origin,
            niche="utility",
        )
        self.database.add(entry)
        if self.current_metrics is None or candidate_metrics.utility > self.current_metrics.utility:
            self.current_code = candidate_code
            self.current_metrics = candidate_metrics

    def _persist_summary(self) -> None:
        best = self.database.best()
        summary = {
            "best": {
                "utility": best.metrics.utility if best else None,
                "diff": best.diff if best else None,
            },
            "history": [
                {
                    "generation": entry.generation,
                    "utility": entry.metrics.utility,
                    "gmv": entry.metrics.gmv,
                    "cost": entry.metrics.cost,
                    "latency": entry.metrics.latency,
                    "fairness": entry.metrics.fairness,
                }
                for entry in self.database.all_entries()
            ],
        }
        summary_path = self.manifest_path.with_name("alphaevolve_summary.json")
        summary_path.write_text(json.dumps(summary, indent=2))

