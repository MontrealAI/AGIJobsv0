"""Simulation harness exercising the HGM orchestration workflow."""

from __future__ import annotations

import asyncio
import random
from typing import Dict

from orchestrator.workflows import HGMOrchestrationWorkflow
from orchestrator.workflows.hgm import WorkflowConfig


async def run_simulation(
    *,
    expansions: int = 5,
    concurrency: int = 3,
    seed: int | None = None,
) -> Dict[str, object]:
    """Run a lightweight orchestration simulation returning engine metadata."""

    rng = random.Random(seed)
    workflow = HGMOrchestrationWorkflow(config=WorkflowConfig(concurrency=concurrency))
    await workflow.ensure_node("root")
    actions = [f"agent-{idx}" for idx in range(1, 6)]

    async def expansion(action: str) -> Dict[str, object]:
        await asyncio.sleep(rng.uniform(0.01, 0.05))
        return {"quality": rng.uniform(0.4, 0.9), "action": action}

    async def evaluation() -> tuple[float, float]:
        await asyncio.sleep(rng.uniform(0.01, 0.03))
        return rng.uniform(0.3, 0.95), 1.0

    for idx in range(expansions):
        await workflow.schedule_expansion("root", actions, expansion, request_id=f"exp-{idx}")

    await workflow.drain()
    snapshot = await workflow.snapshot()

    for key in list(snapshot.keys()):
        if not key.startswith("root/"):
            continue
        await workflow.schedule_evaluation(key, evaluation, request_id=f"eval-{key}")

    await workflow.drain()
    snapshot = await workflow.snapshot()
    return {key: node.as_dict() for key, node in snapshot.items()}


__all__ = ["run_simulation"]
