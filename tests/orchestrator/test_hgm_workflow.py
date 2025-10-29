import asyncio
import sys
from pathlib import Path
from typing import List

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packages" / "hgm-core" / "src"))

import pytest

from orchestrator.workflows import HGMOrchestrationWorkflow, TaskScheduler
from orchestrator.workflows.hgm import WorkflowConfig
from orchestrator.tools.executors import RetryPolicy


def test_scheduler_respects_concurrency_and_retries():
    async def scenario() -> None:
        scheduler = TaskScheduler(concurrency=2, retry=RetryPolicy(attempts=3, backoff=0.01))
        running: List[int] = []
        peak = 0

        async def _task(name: int):
            nonlocal peak
            running.append(name)
            peak = max(peak, len(running))
            await asyncio.sleep(0.02)
            running.remove(name)

        attempts = 0

        async def _failing_task():
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise RuntimeError("fail")

        await scheduler.schedule("a", lambda: _task(1))
        await scheduler.schedule("b", lambda: _task(2))
        await scheduler.schedule("c", lambda: _task(3))
        await scheduler.schedule("retry", _failing_task)
        await scheduler.wait_for_all()

        assert peak <= 2
        assert attempts == 3
        assert scheduler.attempts["retry"] == 3

    asyncio.run(scenario())


def test_workflow_applies_results_and_blocks_busy_agents():
    async def scenario() -> None:
        workflow = HGMOrchestrationWorkflow(
            config=WorkflowConfig(concurrency=2, retry=RetryPolicy(attempts=2, backoff=0.01)),
        )
        await workflow.ensure_node("root")

        async def expansion(action: str):
            await asyncio.sleep(0.01)
            return {"quality": 0.7, "action": action}

        scheduled = await workflow.schedule_expansion("root", ["a", "b"], expansion, request_id="exp-1")
        assert scheduled is True

        duplicate = await workflow.schedule_expansion("root", ["a", "b"], expansion, request_id="exp-1")
        assert duplicate is False

        await workflow.drain()
        snapshot = await workflow.snapshot()
        assert "root/a" in snapshot
        assert snapshot["root/a"].metadata["quality"] == pytest.approx(0.7)

        eval_calls: List[str] = []

        async def evaluation():
            eval_calls.append("call")
            await asyncio.sleep(0.01)
            return 0.9, 1.0

        first = await workflow.schedule_evaluation("root/a", evaluation, request_id="eval-1")
        assert first is True

        busy = await workflow.schedule_evaluation("root/a", evaluation, request_id="eval-2")
        assert busy is False

        await workflow.drain()

        duplicate_after = await workflow.schedule_evaluation("root/a", evaluation, request_id="eval-1")
        assert duplicate_after is False

        fresh = await workflow.schedule_evaluation("root/a", evaluation, request_id="eval-3")
        assert fresh is True

        await workflow.drain()

        snapshot = await workflow.snapshot()
        node = snapshot["root/a"]
        assert node.success_weight > 0
        assert len(eval_calls) == 2

        busy_agents = await workflow.busy_agents()
        assert not busy_agents

    asyncio.run(scenario())
