"""Sequential orchestrator coordinating the HGM demo components."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from .config import DemoConfig
from .engine import HGMEngine
from .persistence import Persistence
from .sentinel import Sentinel
from .simulation import Simulator
from .thermostat import Thermostat


@dataclass(slots=True)
class OrchestratorResult:
    final_agent_id: Optional[str]
    report: Dict[str, float]


class Orchestrator:
    """Runs a single-threaded version of the HGM decision loop."""

    def __init__(self, engine: HGMEngine, simulator: Simulator, config: DemoConfig, persistence: Persistence) -> None:
        self.engine = engine
        self.simulator = simulator
        self.config = config
        self.persistence = persistence
        self.thermostat = Thermostat(config, engine)
        self.sentinel = Sentinel(config, engine)

    async def run(self) -> OrchestratorResult:
        self.persistence.start_run()
        try:
            await self._run_loop()
        finally:
            self.persistence.finish_run(self.engine.metrics)

        final_agent = self.engine.final_agent()
        report = {
            "expansions": float(self.engine.metrics.expansions),
            "evaluations": float(self.engine.metrics.evaluations),
            "gmv": self.engine.metrics.gmv,
            "cost": self.engine.metrics.cost,
            "roi": self.engine.metrics.roi,
        }
        if final_agent:
            report["final_agent"] = final_agent.identifier
        return OrchestratorResult(final_agent.identifier if final_agent else None, report)

    async def _run_loop(self) -> None:
        for iteration in range(self.config.total_iterations):
            if self._is_budget_exhausted():
                break

            await self._maybe_expand()
            await self._maybe_evaluate()

            self.thermostat.maybe_adjust(iteration, self.persistence)
            self.sentinel.enforce(iteration, self.persistence)

    async def _maybe_expand(self) -> None:
        if not self.sentinel.expansions_allowed:
            return
        if self.engine.metrics.expansions >= self.config.max_expansions:
            return
        candidate = self.engine.choose_expansion_agent()
        if candidate is None:
            return

        projected_cost = self.engine.metrics.cost + self.config.expansion_cost
        if projected_cost > self.config.max_cost:
            return

        outcome = await self.simulator.expand(candidate.identifier)
        child = self.engine.expansion_result(candidate.identifier, outcome.quality_delta, outcome.metadata)
        self.simulator.register_child(child.identifier, candidate.identifier, outcome.quality_delta)
        self.engine.metrics.cost += self.config.expansion_cost
        self.persistence.record_expansion(candidate.identifier, child.identifier, child.generation, outcome)

    async def _maybe_evaluate(self) -> None:
        if self.engine.metrics.evaluations >= self.config.max_evaluations:
            return
        candidate = self.engine.choose_evaluation_agent()
        if candidate is None:
            return

        outcome = await self.simulator.evaluate(candidate.identifier)
        self.engine.evaluation_result(candidate.identifier, outcome.success, outcome.reward, outcome.cost)
        self.persistence.record_evaluation(candidate.identifier, outcome)
        self.thermostat.observe(outcome)
        self.sentinel.observe(outcome)

    def _is_budget_exhausted(self) -> bool:
        return (
            self.engine.metrics.expansions >= self.config.max_expansions
            and self.engine.metrics.evaluations >= self.config.max_evaluations
        ) or self.engine.metrics.cost >= self.config.max_cost

