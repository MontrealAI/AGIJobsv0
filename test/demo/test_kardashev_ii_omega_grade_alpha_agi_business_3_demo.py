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


    def test_job_spec_from_dict(self) -> None:
        spec = JobSpec.from_dict(
            {
                "title": "Spec",
                "description": "Declarative",
                "required_skills": "alpha",
                "reward_tokens": 123,
                "deadline_minutes": 30,
                "validation_window_seconds": 90,
                "metadata": {"employer": "operator"},
            }
        )
        self.assertEqual(spec.title, "Spec")
        self.assertIn("alpha", spec.required_skills)
        self.assertGreaterEqual((spec.deadline - datetime.now(timezone.utc)).total_seconds(), 29 * 60)
        self.assertAlmostEqual(spec.validation_window.total_seconds(), 90)
        self.assertEqual(spec.metadata.get("employer"), "operator")


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

    def test_capacity_updates_preserve_recorded_usage(self) -> None:
        manager = ResourceManager(energy_capacity=1_000, compute_capacity=2_000, base_token_supply=5_000)
        manager.record_usage("worker", energy=250, compute=800)
        self.assertAlmostEqual(manager.energy_available, 750)
        self.assertAlmostEqual(manager.compute_available, 1_200)

        manager.update_capacity(
            energy_capacity=1_500,
            compute_capacity=2_500,
            energy_available=1_250,
            compute_available=1_700,
        )

        self.assertAlmostEqual(manager.energy_available, 1_250)
        self.assertAlmostEqual(manager.compute_available, 1_700)
        self.assertAlmostEqual(manager.energy_price, 1.0 + max(0.0, 1.0 - 1_250 / 1_500))
        self.assertAlmostEqual(manager.compute_price, 1.0 + max(0.0, 1.0 - 1_700 / 2_500))


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

    async def test_listener_hook_records_messages(self) -> None:
        bus = MessageBus()
        calls: list[tuple[str, str]] = []

        async def listener(topic: str, payload: dict[str, str], publisher: str) -> None:
            calls.append((topic, publisher))

        bus.register_listener(listener)
        await bus.publish("jobs:test", {"job_id": "abc"}, "tester")
        self.assertEqual(calls, [("jobs:test", "tester")])


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

    async def test_initial_jobs_seeded_from_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            checkpoint = Path(tmp) / "checkpoint.json"
            control = Path(tmp) / "control.jsonl"
            governance = GovernanceParameters(
                validator_commit_window=timedelta(seconds=0.1),
                validator_reveal_window=timedelta(seconds=0.1),
                approvals_required=1,
            )
            config = OrchestratorConfig(
                max_cycles=10,
                checkpoint_path=checkpoint,
                control_channel_file=control,
                insight_interval_seconds=1,
                checkpoint_interval_seconds=1,
                cycle_sleep_seconds=0.05,
                governance=governance,
                initial_jobs=[
                    {
                        "title": "Synthetic Logistics",
                        "description": "Spin up logistics mesh",
                        "required_skills": ["supply-chain"],
                        "reward_tokens": 200.0,
                        "deadline_minutes": 10,
                        "validation_window_minutes": 1,
                        "metadata": {"employer": "operator"},
                    }
                ],
            )
            orchestrator = Orchestrator(config)
            await orchestrator.start()
            await asyncio.sleep(0.2)
            titles = [job.spec.title for job in orchestrator.job_registry.iter_jobs()]
            self.assertIn("Synthetic Logistics", titles)
            await orchestrator.shutdown()

    async def test_audit_trail_records_messages(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            checkpoint = Path(tmp) / "checkpoint.json"
            control = Path(tmp) / "control.jsonl"
            audit = Path(tmp) / "audit.jsonl"
            governance = GovernanceParameters(
                validator_commit_window=timedelta(seconds=0.1),
                validator_reveal_window=timedelta(seconds=0.1),
                approvals_required=1,
            )
            config = OrchestratorConfig(
                max_cycles=10,
                checkpoint_path=checkpoint,
                control_channel_file=control,
                audit_log_path=audit,
                insight_interval_seconds=1,
                checkpoint_interval_seconds=1,
                cycle_sleep_seconds=0.05,
                governance=governance,
            )
            orchestrator = Orchestrator(config)
            await orchestrator.start()
            await asyncio.sleep(0.3)
            await orchestrator.shutdown()
            ledger = [json.loads(line) for line in audit.read_text().strip().splitlines() if line.strip()]
            self.assertTrue(ledger)
            self.assertIn(ledger[0]["algorithm"], {"BLAKE3", "BLAKE2b-256"})

    async def test_control_updates_parameters(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            checkpoint = Path(tmp) / "checkpoint.json"
            control = Path(tmp) / "control.jsonl"
            governance = GovernanceParameters(
                validator_commit_window=timedelta(seconds=0.1),
                validator_reveal_window=timedelta(seconds=0.1),
                approvals_required=1,
            )
            config = OrchestratorConfig(
                max_cycles=10,
                checkpoint_path=checkpoint,
                control_channel_file=control,
                insight_interval_seconds=1,
                checkpoint_interval_seconds=1,
                cycle_sleep_seconds=0.05,
                governance=governance,
            )
            orchestrator = Orchestrator(config)
            await orchestrator.start()
            await asyncio.sleep(0.1)
            await orchestrator.bus.broadcast_control(
                {
                    "action": "update_parameters",
                    "governance": {
                        "worker_stake_ratio": 0.25,
                        "validator_commit_window": 0.2,
                        "approvals_required": 1,
                        "pause_enabled": False,
                    },
                    "resources": {
                        "energy_capacity": 2_000.0,
                        "energy_available": 2_000.0,
                        "compute_available": 3_000.0,
                        "accounts": [
                            {"name": config.operator_account, "tokens": 50_000.0},
                        ],
                    },
                    "config": {"insight_interval_seconds": 2, "max_cycles": 0},
                },
                "test",
            )
            await asyncio.sleep(0.5)
            self.assertAlmostEqual(orchestrator.governance.params.worker_stake_ratio, 0.25)
            self.assertFalse(orchestrator.governance.params.pause_enabled)
            self.assertAlmostEqual(orchestrator.resources.energy_available, 2_000.0)
            self.assertAlmostEqual(orchestrator.resources.compute_available, 3_000.0)
            operator = orchestrator.resources.get_account(config.operator_account)
            self.assertAlmostEqual(operator.tokens, 50_000.0)
            self.assertIsNone(orchestrator.config.max_cycles)
            await orchestrator.shutdown()

    async def test_operator_can_cancel_job(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            checkpoint = Path(tmp) / "checkpoint.json"
            control = Path(tmp) / "control.jsonl"
            governance = GovernanceParameters(
                validator_commit_window=timedelta(seconds=0.1),
                validator_reveal_window=timedelta(seconds=0.1),
                approvals_required=1,
            )
            config = OrchestratorConfig(
                max_cycles=20,
                checkpoint_path=checkpoint,
                control_channel_file=control,
                insight_interval_seconds=1,
                checkpoint_interval_seconds=1,
                cycle_sleep_seconds=0.05,
                governance=governance,
            )
            orchestrator = Orchestrator(config)
            await orchestrator.start()
            await asyncio.sleep(0.5)
            posted = orchestrator.job_registry.jobs_by_status(JobStatus.POSTED)
            self.assertTrue(posted)
            job = posted[0]
            operator_before = orchestrator.resources.get_account(config.operator_account).tokens
            await orchestrator.bus.broadcast_control(
                {"action": "cancel_job", "job_id": job.job_id, "reason": "Operator override"},
                "test",
            )
            await asyncio.sleep(0.5)
            cancelled = orchestrator.job_registry.get_job(job.job_id)
            self.assertEqual(cancelled.status, JobStatus.CANCELLED)
            operator_after = orchestrator.resources.get_account(config.operator_account).tokens
            self.assertGreaterEqual(operator_after, operator_before)
            await orchestrator.shutdown()

    async def test_simulation_updates_resources(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            checkpoint = Path(tmp) / "checkpoint.json"
            control = Path(tmp) / "control.jsonl"
            governance = GovernanceParameters(
                validator_commit_window=timedelta(seconds=0.05),
                validator_reveal_window=timedelta(seconds=0.05),
                approvals_required=1,
            )
            config = OrchestratorConfig(
                max_cycles=10,
                checkpoint_path=checkpoint,
                control_channel_file=control,
                insight_interval_seconds=2,
                checkpoint_interval_seconds=10,
                cycle_sleep_seconds=0.05,
                governance=governance,
                energy_capacity=500.0,
                compute_capacity=1_000.0,
                simulation_tick_seconds=0.05,
                simulation_hours_per_tick=6.0,
                simulation_energy_scale=1.0,
                simulation_compute_scale=1.0,
            )
            orchestrator = Orchestrator(config)
            await orchestrator.start()
            await asyncio.sleep(0.3)
            energy_after = orchestrator.resources.energy_available
            compute_after = orchestrator.resources.compute_available
            await orchestrator.shutdown()
            self.assertGreater(energy_after, 500.0)
            self.assertGreater(compute_after, 1_000.0)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
