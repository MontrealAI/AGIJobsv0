"""Unit tests for the Kardashev-II Omega-Grade α-AGI Business 3 demo."""

from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.jobs import JobRegistry, JobSpec, JobStatus
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.messaging import (
    MessageBus,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.governance import (
    GovernanceParameters,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.resources import (
    ResourceManager,
)


class JobRegistryTests(unittest.TestCase):
    def test_parent_child_relationships(self) -> None:
        registry = JobRegistry()
        parent_spec = JobSpec(
            title="Parent",
            description="Root job",
            required_skills=["alpha"],
            reward_tokens=100,
            deadline=datetime.now(timezone.utc) + timedelta(hours=1),
            validation_window=timedelta(minutes=10),
        )
        parent = registry.create_job(parent_spec)
        child_spec = JobSpec(
            title="Child",
            description="Sub task",
            required_skills=["alpha"],
            reward_tokens=50,
            deadline=datetime.now(timezone.utc) + timedelta(hours=1),
            validation_window=timedelta(minutes=5),
            parent_id=parent.job_id,
        )
        child = registry.create_job(child_spec)
        children = registry.children_of(parent.job_id)
        self.assertEqual([child.job_id], [c.job_id for c in children])
        self.assertEqual(child.spec.parent_id, parent.job_id)


class ResourceManagerTests(unittest.TestCase):
    def test_stake_and_slash_flow(self) -> None:
        manager = ResourceManager(energy_capacity=10_000, compute_capacity=10_000, base_token_supply=1_000)
        manager.ensure_account("worker", 500)
        manager.lock_stake("worker", 100)
        self.assertEqual(manager._accounts["worker"].locked, 100)  # type: ignore[attr-defined]
        manager.release_stake("worker", 60)
        self.assertAlmostEqual(manager._accounts["worker"].locked, 40)  # type: ignore[attr-defined]
        manager.slash("worker", 20)
        self.assertAlmostEqual(manager._accounts["worker"].locked, 20)  # type: ignore[attr-defined]


class MessageBusTests(unittest.IsolatedAsyncioTestCase):
    async def test_pattern_subscription(self) -> None:
        bus = MessageBus()
        received = []

        async with bus.subscribe("jobs:assignment:*") as receiver:
            async def listener() -> None:
                for _ in range(2):
                    message = await receiver()
                    received.append(message.payload["job_id"])

            listener_task = asyncio.create_task(listener())
            await bus.publish("jobs:assignment:1", {"job_id": "1"}, "test")
            await bus.publish("jobs:assignment:2", {"job_id": "2"}, "test")
            await listener_task

        self.assertEqual(received, ["1", "2"])


class OrchestratorTests(unittest.IsolatedAsyncioTestCase):
    async def test_orchestrator_runs_and_finalises_jobs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            checkpoint = Path(tmp) / "checkpoint.json"
            control = Path(tmp) / "control.jsonl"
            governance = GovernanceParameters(
                validator_commit_window=timedelta(seconds=0.1),
                validator_reveal_window=timedelta(seconds=0.1),
                approvals_required=1,
            )
            config = OrchestratorConfig(
                max_cycles=40,
                checkpoint_path=checkpoint,
                control_channel_file=control,
                insight_interval_seconds=1,
                checkpoint_interval_seconds=1,
                cycle_sleep_seconds=0.05,
                governance=governance,
            )
            orchestrator = Orchestrator(config)
            await orchestrator.start()

            async def stop_later() -> None:
                await asyncio.sleep(2)
                await orchestrator.shutdown()

            stopper = asyncio.create_task(stop_later())
            await orchestrator.wait_until_stopped()
            await stopper

            jobs = list(orchestrator.job_registry.iter_jobs())
            self.assertTrue(jobs)
            self.assertTrue(any(job.status in {JobStatus.COMPLETED, JobStatus.FINALIZED, JobStatus.FAILED} for job in jobs))
            snapshot = json.loads(checkpoint.read_text())
            self.assertIn("jobs", snapshot)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
