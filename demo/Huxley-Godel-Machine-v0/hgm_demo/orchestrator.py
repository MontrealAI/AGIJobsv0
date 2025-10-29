"""Async-friendly orchestrator driving the HGM demo simulation."""
from __future__ import annotations

import asyncio
import math
import random
from dataclasses import dataclass
from typing import Callable, Optional, Set

from .engine import ActionType, DecisionContext, EngineAction, HGMEngine
from .metrics import RunMetrics
from .sentinel import Sentinel, SentinelConfig, SentinelOutcome
from .thermostat import Thermostat, ThermostatConfig, ThermostatDecision

LogCallback = Callable[[str], None]


@dataclass
class EconomicParameters:
    evaluation_cost: float = 12.0
    expansion_cost: float = 30.0
    base_success_value: float = 180.0
    expansion_latency: float = 0.01
    evaluation_latency: float = 0.008


class DemoOrchestrator:
    def __init__(
        self,
        engine: HGMEngine,
        *,
        thermostat: Optional[Thermostat] = None,
        sentinel: Optional[Sentinel] = None,
        parameters: Optional[EconomicParameters] = None,
        rng=None,
    ) -> None:
        self.engine = engine
        self.thermostat = thermostat or Thermostat(ThermostatConfig())
        self.sentinel = sentinel or Sentinel(SentinelConfig())
        self.parameters = parameters or EconomicParameters()
        self.metrics = RunMetrics()
        self._pending_tasks: Set[asyncio.Task] = set()
        self._pending_expansions = 0
        self._pending_evaluations = 0
        self._loop = asyncio.get_event_loop()
        self._rng = rng or random.Random()

    async def run(self, *, max_actions: int, log: Optional[LogCallback] = None) -> None:
        while self.metrics.total_actions < max_actions:
            sentinel_outcome = self.sentinel.inspect(self.engine, self.metrics)
            if log and sentinel_outcome.triggered_rules:
                for rule in sentinel_outcome.triggered_rules:
                    log(f"⚠️ Sentinel event: {rule}")

            context = DecisionContext(
                allow_expansions=sentinel_outcome.allow_expansions,
                allow_evaluations=sentinel_outcome.allow_evaluations,
                pending_expansions=self._pending_expansions,
                pending_evaluations=self._pending_evaluations,
                max_concurrent_evaluations=self.thermostat.concurrency,
            )
            decision = self.engine.next_action(context)

            if decision is None:
                if self._pending_tasks:
                    await self._await_one()
                    continue
                break

            task = self._schedule_action(decision, log)
            if task is not None:
                self._pending_tasks.add(task)
                continue

            if self._pending_tasks:
                await self._await_one()
            else:
                break

        if self._pending_tasks:
            await asyncio.wait(self._pending_tasks)

    def _schedule_action(self, decision: EngineAction, log: Optional[LogCallback]) -> Optional[asyncio.Task]:
        if decision.action is ActionType.EXPAND:
            self._pending_expansions += 1
            task = self._loop.create_task(self._handle_expansion(decision.target_agent_id, log))
            task.add_done_callback(self._pending_tasks.discard)
            return task
        if decision.action is ActionType.EVALUATE:
            self._pending_evaluations += 1
            task = self._loop.create_task(self._handle_evaluation(decision.target_agent_id, log))
            task.add_done_callback(self._pending_tasks.discard)
            return task
        return None

    async def _await_one(self) -> None:
        if not self._pending_tasks:
            return
        done, pending = await asyncio.wait(self._pending_tasks, return_when=asyncio.FIRST_COMPLETED)
        self._pending_tasks = pending
        for task in done:
            task.result()

    async def _handle_expansion(self, parent_id: str, log: Optional[LogCallback]) -> None:
        try:
            await asyncio.sleep(self.parameters.expansion_latency)
            parent = self.engine.get_agent(parent_id)
            mutation = self._gaussian(0.08, 0.1)
            new_quality = max(0.05, min(0.99, parent.quality + mutation))
            description = (
                f"Self-modification from {parent.agent_id} with Δquality={mutation:+.3f}\n"
                "Infused with CMP-guided insights and governance hooks."
            )
            child = self.engine.create_child(parent.agent_id, quality=new_quality, description=description)
            cost = self.parameters.expansion_cost
            self.metrics.record_expansion(cost=cost)
            if log:
                log(
                    "🧬 Expansion → created {child} (quality={quality:.2%}) cost=${cost:.2f} from parent {parent}"
                    .format(
                        child=child.agent_id,
                        quality=new_quality,
                        cost=cost,
                        parent=parent.agent_id,
                    )
                )
            self.engine.mark_idle(parent.agent_id)
        finally:
            self._pending_expansions -= 1

    async def _handle_evaluation(self, agent_id: str, log: Optional[LogCallback]) -> None:
        try:
            await asyncio.sleep(self.parameters.evaluation_latency)
            agent = self.engine.get_agent(agent_id)
            success_probability = max(0.01, min(0.99, agent.quality))
            success = self._random() < success_probability
            gmv = self._compute_gmv(agent, success)
            cost = self.parameters.evaluation_cost
            self.engine.record_evaluation(agent.agent_id, success)
            self.metrics.record_evaluation(agent.agent_id, success, gmv=gmv, cost=cost)
            if success:
                self.metrics.reset_agent_failure(agent.agent_id)

            if log:
                outcome = "✅" if success else "❌"
                log(
                    f"{outcome} Evaluation agent={agent.agent_id} generation={agent.generation} "
                    f"prob={success_probability:.2%} gmv=${gmv:.2f} cost=${cost:.2f}"
                )

            decision = self.thermostat.evaluate(self.engine, self.metrics)
            if log:
                notes = "; ".join(decision.notes)
                log(
                    f"🎛️ Thermostat ⇒ τ={decision.tau:.2f} α={decision.alpha:.2f} "
                    f"concurrency={decision.concurrency} :: {notes}"
                )

            self.engine.mark_idle(agent.agent_id)
        finally:
            self._pending_evaluations -= 1

    def _compute_gmv(self, agent, success: bool) -> float:
        if not success:
            return 0.0
        bonus = 1.0 + 0.15 * agent.generation + 0.05 * agent.success_rate
        adaptive = 1.0 + math.log1p(self.metrics.total_successes + 1) * 0.1
        return self.parameters.base_success_value * bonus * adaptive

    def _random(self) -> float:
        return self._rng.random()

    def _gaussian(self, mu: float, sigma: float) -> float:
        return self._rng.gauss(mu, sigma)


__all__ = ["DemoOrchestrator", "EconomicParameters"]
