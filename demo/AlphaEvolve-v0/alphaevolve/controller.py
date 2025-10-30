from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Mapping

from .config import AlphaEvolveConfig
from .evaluator import EvaluationHarness
from .guardrails import GuardrailOutcome, enforce_guardrails
from .llm import HeuristicPerturbationAgent, ScriptedLLMClient
from .metrics import MetricsRegistry
from .program_db import ProgramAtlas, ProgramRecord
from .prompt import PromptBuilder
from .rollout import RolloutState, promote


@dataclass(slots=True)
class ControllerReport:
    generation: int
    accepted: bool
    metrics: Mapping[str, float]
    guardrail: GuardrailOutcome
    elapsed: float


class AlphaEvolveController:
    def __init__(self, config: AlphaEvolveConfig, harness: EvaluationHarness, atlas: ProgramAtlas, registry: MetricsRegistry) -> None:
        self.config = config
        self.harness = harness
        self.atlas = atlas
        self.registry = registry
        self.client = ScriptedLLMClient()
        self.agent = HeuristicPerturbationAgent(
            client=self.client,
            fast_model=config.models.fast_model,
            strong_model=config.models.strong_model,
            strong_invoke_ratio=config.models.strong_invoke_ratio,
        )
        self.prompt_builder = PromptBuilder(
            explicit_context=config.prompt.explicit_context,
            include_metrics=config.prompt.include_metrics,
            stochastic_templates=config.prompt.stochastic_templates,
        )
        self.thermostat_temperature = config.thermostat.max_temperature
        self.success_history: list[bool] = []
        self.rollout_state = RolloutState()

    def seed(self, seed: int) -> None:
        self.client.seed(seed)
        self.agent.seed(seed)
        self.prompt_builder.seed(seed)

    def _update_thermostat(self, success: bool) -> None:
        cfg = self.config.thermostat
        self.success_history.append(success)
        if len(self.success_history) > cfg.success_window:
            self.success_history.pop(0)
        window_success = sum(1 for s in self.success_history if s) / max(1, len(self.success_history))
        if window_success < cfg.low_success_threshold:
            self.thermostat_temperature = max(cfg.min_temperature, self.thermostat_temperature * 0.8)
        elif window_success > cfg.high_success_threshold:
            self.thermostat_temperature = min(cfg.max_temperature, self.thermostat_temperature * 1.1)

    async def run_generation(self, generation: int, *, agents, jobs) -> ControllerReport:
        start = time.perf_counter()
        try:
            parents = self.atlas.sample_parents()
        except ValueError:
            parents = []
        current_metrics = parents[0].metrics if parents else self.config.baseline_metrics
        packet = self.prompt_builder.build(generation, parents, current_metrics)
        proposals = self.agent.propose([packet], self.thermostat_temperature)
        proposal = proposals[0]
        metrics = await self.harness.evaluate(proposal.diff, agents=agents, jobs=jobs)
        guardrail = enforce_guardrails(metrics, self.config.guardrails, self.config.baseline_metrics)
        accepted = False
        if guardrail.ok and metrics["Utility"] >= current_metrics.get("Utility", 0):
            accepted = True
            record = ProgramRecord(
                generation=generation,
                code=proposal.diff.raw,
                metrics=metrics,
                diff_metadata={"model": proposal.metadata.get("model", "")},
            )
            self.atlas.add(record)
            self.rollout_state = promote(self.rollout_state)
            self.registry.set("agi_alpha_utility", metrics["Utility"])
            self.registry.set("agi_alpha_gmv", metrics["GMV"])
            self.registry.set("agi_alpha_cost", metrics["Cost"])
        self._update_thermostat(accepted)
        elapsed = time.perf_counter() - start
        return ControllerReport(
            generation=generation,
            accepted=accepted,
            metrics=metrics,
            guardrail=guardrail,
            elapsed=elapsed,
        )


__all__ = ["AlphaEvolveController", "ControllerReport"]
