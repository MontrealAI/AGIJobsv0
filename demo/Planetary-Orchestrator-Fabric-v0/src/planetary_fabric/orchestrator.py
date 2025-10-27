"""High level Planetary Orchestrator Fabric implementation."""
from __future__ import annotations

import random
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from .checkpoint import CheckpointManager
from .job_models import Assignment, Job, JobResult, Node, NodeHealth, Shard
from .node_marketplace import NodeMarketplace
from .owner_console import OwnerConsole
from .router import GlobalOrchestrator
from .shard_registry import MultiShardRegistry


@dataclass
class FabricMetrics:
    """Realtime metrics for dashboards and reports."""

    dispatched_jobs: int = 0
    completed_jobs: int = 0
    failed_jobs: int = 0
    reassigned_jobs: int = 0
    spillovers: int = 0

    def serialize(self) -> Dict[str, int]:
        return {
            "dispatched_jobs": self.dispatched_jobs,
            "completed_jobs": self.completed_jobs,
            "failed_jobs": self.failed_jobs,
            "reassigned_jobs": self.reassigned_jobs,
            "spillovers": self.spillovers,
        }


class PlanetaryOrchestratorFabric:
    """Self-contained demo harness that coordinates shards and nodes."""

    def __init__(
        self,
        shards: Optional[Iterable[Shard]] = None,
        checkpoint_path: Optional[str] = None,
        heartbeat_timeout: float = 30.0,
    ) -> None:
        self.shards = list(shards or [Shard.EARTH, Shard.LUNA, Shard.MARS, Shard.HELIOS, Shard.EDGE])
        self.registry = MultiShardRegistry(self.shards)
        self.marketplace = NodeMarketplace(heartbeat_timeout=heartbeat_timeout)
        self.orchestrator = GlobalOrchestrator(self.registry, self.marketplace)
        self.owner_console = OwnerConsole(self.orchestrator)
        checkpoint_file = checkpoint_path or str(Path("reports/planetary-fabric/checkpoint.json"))
        self.checkpoint = CheckpointManager(checkpoint_file)
        self.metrics = FabricMetrics()
        self._loaded_from_checkpoint = False

    # ------------------------------------------------------------------
    # Job lifecycle
    # ------------------------------------------------------------------
    def register_job(self, job: Job) -> None:
        self.registry.add_job(job)

    def register_jobs(self, jobs: Iterable[Job]) -> None:
        for job in jobs:
            self.register_job(job)

    def register_node(self, node: Node) -> None:
        self.marketplace.register_node(node)

    def heartbeat(self, node_id: str, health: Optional[NodeHealth] = None) -> None:
        self.marketplace.heartbeat(node_id, health)

    def dispatch_once(self) -> List[Assignment]:
        dispatched: List[Assignment] = []
        for job, node, spillover in self.orchestrator.run_once():
            dispatched.append(Assignment(job.job_id, node.node_id, node.shard, time.time(), spillover))
            if spillover:
                self.metrics.spillovers += 1
            self.metrics.dispatched_jobs += 1
        return dispatched

    def complete_job(self, job_id: str, output: Dict[str, str], latency_ms: Optional[int] = None) -> None:
        job = self._lookup_job(job_id)
        latency = latency_ms or random.randint(50, 2000)
        result = JobResult(output=output, metadata={"latency_ms": latency})
        registry = self.registry.get_registry(job.shard)
        registry.complete_job(job, latency)
        self.marketplace.finish_job(job)
        self.metrics.completed_jobs += 1

    def fail_job(self, job_id: str, reason: str) -> None:
        job = self._lookup_job(job_id)
        registry = self.registry.get_registry(job.shard)
        attempts_before = job.attempts
        registry.fail_job(job)
        self.marketplace.finish_job(job)
        self.metrics.failed_jobs += 1
        if job.attempts > attempts_before:
            self.metrics.reassigned_jobs += 1

    def _lookup_job(self, job_id: str) -> Job:
        for registry in self.registry.registries.values():
            job = registry._jobs.get(job_id)
            if job:
                return job
        raise KeyError(f"Unknown job_id {job_id}")

    # ------------------------------------------------------------------
    # Checkpointing
    # ------------------------------------------------------------------
    def save_checkpoint(self) -> str:
        state = {
            "registry": self.registry.serialize(),
            "marketplace": self.marketplace.serialize(),
            "orchestrator": self.orchestrator.serialize(),
            "metrics": self.metrics.serialize(),
        }
        return self.checkpoint.save(state)

    def load_checkpoint(self) -> bool:
        state = self.checkpoint.load()
        if not state:
            return False
        self.registry = MultiShardRegistry.deserialize(state["registry"])
        self.marketplace = NodeMarketplace.deserialize(state["marketplace"])
        self.orchestrator = GlobalOrchestrator(self.registry, self.marketplace)
        self.owner_console = OwnerConsole(self.orchestrator)
        self.orchestrator.apply_state(state.get("orchestrator", {}))
        metrics_data = state.get("metrics", {})
        self.metrics = FabricMetrics(
            dispatched_jobs=int(metrics_data.get("dispatched_jobs", 0)),
            completed_jobs=int(metrics_data.get("completed_jobs", 0)),
            failed_jobs=int(metrics_data.get("failed_jobs", 0)),
            reassigned_jobs=int(metrics_data.get("reassigned_jobs", 0)),
            spillovers=int(metrics_data.get("spillovers", 0)),
        )
        self._loaded_from_checkpoint = True
        return True

    def clear_checkpoint(self) -> None:
        self.checkpoint.clear()

    # ------------------------------------------------------------------
    # Simulation utilities
    # ------------------------------------------------------------------
    def simulate_execution(self, max_ticks: int = 1000, completion_probability: float = 0.9) -> Dict[str, object]:
        """Simulate execution loop, optionally resuming from checkpoint."""

        results: Dict[str, object] = {
            "dispatched": 0,
            "completed": 0,
            "failed": 0,
            "reassigned": 0,
            "spillovers": 0,
        }
        for _ in range(max_ticks):
            assignments = self.dispatch_once()
            if not assignments and not any(
                registry.queue_depth() for registry in self.registry.registries.values()
            ):
                break
            for assignment in assignments:
                job = self._lookup_job(assignment.job_id)
                if random.random() <= completion_probability:
                    self.complete_job(
                        assignment.job_id,
                        {"result": f"Job {assignment.job_id} completed by {assignment.node_id}"},
                        latency_ms=random.randint(50, 1500),
                    )
                    results["completed"] += 1
                else:
                    self.fail_job(assignment.job_id, "simulated failure")
                    results["failed"] += 1
                    results["reassigned"] += 1
                if assignment.spillover:
                    results["spillovers"] += 1
            results["dispatched"] += len(assignments)
        results["queue_depths"] = {
            shard.value: registry.queue_depth() for shard, registry in self.registry.registries.items()
        }
        results["metrics"] = self.metrics.serialize()
        results["loaded_from_checkpoint"] = self._loaded_from_checkpoint
        return results

    def bootstrap_demo_nodes(self) -> None:
        seeds = [
            ("earth-gpu-1", Shard.EARTH, 6, {"research", "simulation", "governance"}),
            ("earth-gpu-2", Shard.EARTH, 4, {"research", "analysis"}),
            ("luna-labs", Shard.LUNA, 3, {"logistics", "supply"}),
            ("mars-outpost", Shard.MARS, 5, {"terraform", "mining", "science"}),
            ("helios-gpu", Shard.HELIOS, 8, {"deep-learning", "research"}),
            ("edge-drone", Shard.EDGE, 2, {"inspection", "rescue"}),
        ]
        for node_id, shard, capacity, specialties in seeds:
            self.register_node(Node(node_id=node_id, shard=shard, capacity=capacity, specialties=set(specialties)))

    def bootstrap_jobs(self, count: int, shards: Optional[List[Shard]] = None) -> None:
        shards = shards or self.shards
        for index in range(count):
            shard = random.choice(shards)
            job = Job(
                job_id=f"job-{int(time.time() * 1000)}-{index}",
                shard=shard,
                payload={
                    "skill": random.choice([
                        "research",
                        "simulation",
                        "governance",
                        "analysis",
                        "logistics",
                        "supply",
                        "terraform",
                        "mining",
                        "science",
                        "inspection",
                        "rescue",
                    ]),
                    "description": f"Autonomous task {index} for {shard.value}",
                },
                latency_budget_ms=random.randint(200, 5000),
                priority=random.randint(0, 5),
            )
            self.register_job(job)

    def governance_snapshot(self) -> Dict[str, object]:
        return self.owner_console.serialize()

    def health_report(self) -> Dict[str, object]:
        stale_nodes = self.marketplace.detect_stale_nodes()
        return {
            "stale_nodes": [node.node_id for node in stale_nodes],
            "node_health": {node.node_id: node.health.value for node in self.marketplace.list_nodes()},
            "queue_depths": {shard.value: reg.queue_depth() for shard, reg in self.registry.registries.items()},
        }

    def describe(self) -> Dict[str, object]:
        return {
            "shards": [shard.value for shard in self.shards],
            "nodes": [node.serialize() for node in self.marketplace.list_nodes()],
            "metrics": self.metrics.serialize(),
            "governance": self.governance_snapshot(),
        }
