"""Async orchestrator for the HGM demo."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Optional

from .engine import EngineParameters, HGMEngine
from .sentinel import Sentinel
from .structures import ActionLogEntry, DemoTelemetry, EconomicLedger
from .thermostat import Thermostat


@dataclass
class OrchestratorSettings:
    initial_concurrency: int


class AdaptiveOrchestrator:
    def __init__(
        self,
        *,
        engine: HGMEngine,
        environment,
        thermostat: Thermostat,
        sentinel: Sentinel,
        telemetry: DemoTelemetry,
        settings: OrchestratorSettings,
    ) -> None:
        self.engine = engine
        self.environment = environment
        self.thermostat = thermostat
        self.sentinel = sentinel
        self.telemetry = telemetry
        self.ledger = telemetry.ledger
        self.concurrency = settings.initial_concurrency
        self._step = 0
        self._stop_requested = False

    def set_concurrency(self, concurrency: int) -> None:
        self.concurrency = max(1, concurrency)

    async def run(self) -> None:
        pending: set[asyncio.Task] = set()
        while not self.sentinel.halt_requested and not self._stop_requested:
            while len(pending) < self.concurrency and not self.sentinel.halt_requested:
                decision = self.engine.next_action()
                if decision is None:
                    if not pending:
                        self._stop_requested = True
                    break
                action, agent_id = decision
                if action == "expand":
                    task = asyncio.create_task(self._expand(agent_id))
                else:
                    task = asyncio.create_task(self._evaluate(agent_id))
                pending.add(task)
            if not pending:
                break
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                await self._process_result(task.result())
        final = self.engine.select_final_agent()
        self.telemetry.final_agent_id = final.agent_id if final else None

    async def _expand(self, agent_id: str):
        parent = self.engine.get_agent(agent_id)
        node, ledger_delta = await self.environment.expand(parent)
        return {
            "type": "expand",
            "parent": parent,
            "child": node,
            "ledger": ledger_delta,
        }

    async def _evaluate(self, agent_id: str):
        agent = self.engine.get_agent(agent_id)
        success, ledger_delta = await self.environment.evaluate(agent)
        return {
            "type": "evaluate",
            "agent": agent,
            "success": success,
            "ledger": ledger_delta,
        }

    async def _process_result(self, result: dict) -> None:
        self._step += 1
        ledger_delta: EconomicLedger = result["ledger"]
        self.ledger.gmv += ledger_delta.gmv
        self.ledger.cost += ledger_delta.cost
        if result["type"] == "expand":
            child = result["child"]
            parent = result["parent"]
            child.metadata["step"] = self._step
            self.engine.register_child(parent.agent_id, child)
            payload = {
                "parent": parent.agent_id,
                "new_agent": child.agent_id,
                "quality": child.quality,
                "mutation": child.metadata.get("mutation", 0.0),
            }
            action_type = "EXPAND"
            agent_id = child.agent_id
        else:
            agent = result["agent"]
            success: bool = result["success"]
            self.engine.record_evaluation(agent.agent_id, success)
            payload = {
                "success": 1 if success else 0,
                "quality": agent.quality,
            }
            action_type = "EVALUATE"
            agent_id = agent.agent_id
        entry = ActionLogEntry(
            step=self._step,
            action_type=action_type,
            agent_id=agent_id,
            payload=payload,
            ledger_snapshot=EconomicLedger(self.ledger.gmv, self.ledger.cost),
        )
        self.telemetry.agent_events.append(entry)
        self.sentinel.evaluate(engine=self.engine, ledger=self.ledger)
        self.thermostat.update(ledger=self.ledger, engine=self.engine, orchestrator=self)
