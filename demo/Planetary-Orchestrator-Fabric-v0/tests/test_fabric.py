"""Unit tests for the Planetary Orchestrator Fabric demo."""
from __future__ import annotations

import random
import tempfile
import unittest
from pathlib import Path

from planetary_fabric.orchestrator import PlanetaryOrchestratorFabric
from planetary_fabric.job_models import Job, Shard, Node, NodeHealth


class PlanetaryFabricTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.checkpoint_path = str(Path(self.tmpdir.name) / "checkpoint.json")
        random.seed(7)

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def _fabric(self) -> PlanetaryOrchestratorFabric:
        fabric = PlanetaryOrchestratorFabric(
            shards=[Shard.EARTH, Shard.LUNA, Shard.MARS], checkpoint_path=self.checkpoint_path
        )
        fabric.bootstrap_demo_nodes()
        return fabric

    def test_balanced_completion(self) -> None:
        fabric = self._fabric()
        for index in range(240):
            shard = [Shard.EARTH, Shard.LUNA, Shard.MARS][index % 3]
            job = Job(
                job_id=f"job-test-{index}",
                shard=shard,
                payload={"skill": "research", "description": "test"},
                latency_budget_ms=500,
                priority=index % 5,
            )
            fabric.register_job(job)
        results = fabric.simulate_execution(max_ticks=400, completion_probability=1.0)
        metrics = results["metrics"]
        self.assertEqual(metrics["completed_jobs"], 240)
        for depth in results["queue_depths"].values():
            self.assertEqual(depth, 0)
        self.assertGreaterEqual(results["dispatched"], 240)

    def test_checkpoint_roundtrip(self) -> None:
        fabric = self._fabric()
        fabric.bootstrap_jobs(60, shards=[Shard.EARTH, Shard.LUNA])
        interim = fabric.simulate_execution(max_ticks=80, completion_probability=0.8)
        checkpoint_path = fabric.save_checkpoint()
        resumed = PlanetaryOrchestratorFabric(
            shards=[Shard.EARTH, Shard.LUNA, Shard.MARS], checkpoint_path=checkpoint_path
        )
        self.assertTrue(resumed.load_checkpoint())
        after = resumed.simulate_execution(max_ticks=120, completion_probability=1.0)
        metrics = after["metrics"]
        total = metrics["completed_jobs"] + metrics["failed_jobs"]
        self.assertGreaterEqual(total, interim["completed"] + interim["failed"])
        self.assertTrue(after["loaded_from_checkpoint"])

    def test_node_failure_reassignment(self) -> None:
        fabric = self._fabric()
        # Register limited nodes to force reassignment when one fails
        fabric.marketplace.register_node(Node("mars-specialist", Shard.MARS, 1, {"research"}))
        fabric.bootstrap_jobs(90, shards=[Shard.MARS])
        # Simulate first dispatch cycle then mark node offline
        assignments = fabric.dispatch_once()
        self.assertGreater(len(assignments), 0)
        failure_node = fabric.marketplace.get_node(assignments[0].node_id)
        if failure_node:
            failure_node.health = NodeHealth.OFFLINE
            fabric.fail_job(assignments[0].job_id, "forced outage")
            failure_node.health = NodeHealth.HEALTHY
        results = fabric.simulate_execution(max_ticks=400, completion_probability=1.0)
        metrics = results["metrics"]
        self.assertGreater(metrics["reassigned_jobs"], 0)
        self.assertEqual(results["queue_depths"][Shard.MARS.value], 0)


if __name__ == "__main__":
    unittest.main()
