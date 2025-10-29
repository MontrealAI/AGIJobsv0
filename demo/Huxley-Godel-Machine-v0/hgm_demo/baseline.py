"""Baseline strategy used for comparison in the demo."""
from __future__ import annotations

import asyncio
from typing import List, Tuple

from .simulation import SimulationEnvironment
from .structures import AgentNode, EconomicLedger


class GreedyBaseline:
    """A deliberately myopic strategy that always exploits the current best agent."""

    def __init__(self, environment: SimulationEnvironment, *, expansion_interval: int, max_agents: int) -> None:
        self.environment = environment
        self.expansion_interval = expansion_interval
        self.max_agents = max_agents
        self.ledger = EconomicLedger()
        self.actions: List[Tuple[str, str, bool]] = []

    async def run(self, steps: int, root: AgentNode) -> EconomicLedger:
        agents: List[AgentNode] = [root]
        trials = 0
        while trials < steps:
            if trials % self.expansion_interval == 0 and len(agents) < self.max_agents:
                parent = agents[-1]
                child, ledger_delta = await self.environment.expand(parent)
                agents.append(child)
                self.ledger.cost += ledger_delta.cost
                self.actions.append(("EXPAND", child.agent_id, True))
                trials += 1
                if trials >= steps:
                    break
            target = agents[0]
            success, ledger_delta = await self.environment.evaluate(target)
            if success:
                target.self_success += 1
                self.ledger.gmv += ledger_delta.gmv
                self.ledger.cost += ledger_delta.cost
            else:
                target.self_failure += 1
                self.ledger.cost += ledger_delta.cost
            self.actions.append(("EVALUATE", target.agent_id, success))
            trials += 1
        return self.ledger
