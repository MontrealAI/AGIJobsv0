"""Planetary orchestrator implementation for the demo."""
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

from .config import CheckpointConfig, NodeConfig, RegionConfig
from .jobs import Job, JobState
from .nodes import Node, NodeRegistry
from .router import RegionalRouter


@dataclass
class FabricMetrics:
    total_jobs: int = 0
    completed_jobs: int = 0
    failed_jobs: int = 0
    reassigned_jobs: int = 0
    start_time: float = 0.0
    end_time: float = 0.0

    def completion_rate(self) -> float:
        if self.total_jobs == 0:
            return 1.0
        return self.completed_jobs / self.total_jobs

    def runtime_seconds(self) -> float:
        return max(0.0, self.end_time - self.start_time)


class PlanetaryOrchestrator:
    """Coordinates shard routers, nodes, and job lifecycle."""

    def __init__(
        self,
        regions: List[RegionConfig],
        checkpoint: CheckpointConfig,
        rebalance_interval: float = 0.25,
        heartbeat_interval: float = 0.2,
    ) -> None:
        self.regions = regions
        self.checkpoint_config = checkpoint
        self.rebalance_interval = rebalance_interval
        self.heartbeat_interval = heartbeat_interval
        self.node_registry = NodeRegistry()
        self.routers: Dict[str, RegionalRouter] = {r.name: RegionalRouter(r.name) for r in regions}
        self.jobs: Dict[str, JobState] = {}
        self.metrics = FabricMetrics()
        self._running = False
        self._rebalance_task: Optional[asyncio.Task[None]] = None
        self._heartbeat_task: Optional[asyncio.Task[None]] = None
        self._checkpoint_task: Optional[asyncio.Task[None]] = None
        self._complete_queue: asyncio.Queue[JobState] = asyncio.Queue()
        self._requeue_queue: asyncio.Queue[str] = asyncio.Queue()
        self._completion_event = asyncio.Event()
        self._checkpoint_lock = asyncio.Lock()
        self._background_tasks: List[asyncio.Task[None]] = []

    async def register_node(self, config: NodeConfig) -> Node:
        node = await self.node_registry.register(config)
        router = self.routers[config.region]
        await router.add_node(node)
        return node

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self.metrics.start_time = time.monotonic()
        for router in self.routers.values():
            await router.start(self._complete_queue, self._requeue_queue)
        self._rebalance_task = asyncio.create_task(self._rebalance_loop())
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        self._checkpoint_task = asyncio.create_task(self._checkpoint_loop())
        self._background_tasks.append(asyncio.create_task(self._completion_collector()))
        self._background_tasks.append(asyncio.create_task(self._requeue_collector()))

    async def shutdown(self, persist_state: bool = False) -> None:
        if not self._running:
            return
        self._running = False
        if persist_state:
            await self._persist_checkpoint()
        for router in self.routers.values():
            await router.shutdown()
        if self._rebalance_task:
            self._rebalance_task.cancel()
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
        if self._checkpoint_task:
            self._checkpoint_task.cancel()
        for task in [self._rebalance_task, self._heartbeat_task, self._checkpoint_task]:
            if task is None:
                continue
            try:
                await task
            except asyncio.CancelledError:
                pass
        for task in self._background_tasks:
            task.cancel()
        for task in self._background_tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._background_tasks.clear()
        self.metrics.end_time = time.monotonic()

    async def register_job(self, job: Job) -> None:
        state = JobState(job=job)
        self.jobs[job.job_id] = state
        self.metrics.total_jobs += 1
        await self.routers[job.region].submit(state)

    async def rebalance(self) -> None:
        busiest, quietest = None, None
        max_queue, min_queue = -1, float("inf")
        for region, router in self.routers.items():
            q = router.queued_jobs()
            if q > max_queue:
                max_queue = q
                busiest = region
            if q < min_queue:
                min_queue = q
                quietest = region
        if busiest is None or quietest is None or busiest == quietest:
            return
        if max_queue - min_queue < 10:
            return
        donor = self.routers[busiest]
        recipient = self.routers[quietest]
        job = await donor.take_job()
        if job is None:
            return
        job.region = quietest
        await recipient.submit(self.jobs[job.job_id])
        self.jobs[job.job_id].job.region = quietest

    async def _rebalance_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self.rebalance_interval)
            await self.rebalance()

    async def _heartbeat_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self.heartbeat_interval)
            nodes = await self.node_registry.all_nodes()
            for node in nodes:
                if not node.heartbeat():
                    await self._handle_node_failure(node)

    async def _checkpoint_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self.checkpoint_config.interval_seconds)
            await self._persist_checkpoint()

    async def _completion_collector(self) -> None:
        while True:
            state = await self._complete_queue.get()
            original_state = self.jobs[state.job.job_id]
            original_state.status = "completed"
            original_state.assigned_node = state.assigned_node
            original_state.result = state.result
            self.metrics.completed_jobs += 1
            self._complete_queue.task_done()
            await self._check_completion()

    async def _requeue_collector(self) -> None:
        while True:
            job_id = await self._requeue_queue.get()
            state = self.jobs[job_id]
            state.status = "pending"
            state.assigned_node = None
            state.attempts += 1
            self.metrics.reassigned_jobs += 1
            await self.routers[state.job.region].submit(state)
            self._requeue_queue.task_done()

    async def _handle_node_failure(self, node: Node) -> None:
        router = self.routers[node.config.region]
        await router.remove_node(node)
        await self.node_registry.unregister(node.config.node_id)
        node.revive()
        replacement = await self.node_registry.register(node.config)
        await self.routers[node.config.region].add_node(replacement)

    async def _check_completion(self) -> None:
        if self.metrics.completed_jobs + self.metrics.failed_jobs >= self.metrics.total_jobs:
            self._completion_event.set()

    async def wait_for_all(self, timeout: float = 60.0) -> bool:
        try:
            await asyncio.wait_for(self._completion_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            return False
        return True

    async def _persist_checkpoint(self) -> None:
        async with self._checkpoint_lock:
            path = self.checkpoint_config.resolve_path()
            payload = {
                "jobs": [state.to_dict() for state in self.jobs.values()],
                "metrics": {
                    "total_jobs": self.metrics.total_jobs,
                    "completed_jobs": self.metrics.completed_jobs,
                    "failed_jobs": self.metrics.failed_jobs,
                    "reassigned_jobs": self.metrics.reassigned_jobs,
                },
            }
            for state in payload["jobs"]:
                if state["status"] in {"pending", "in_progress"}:
                    state["status"] = "pending"
                    state["assigned_node"] = None
            path.write_text(json.dumps(payload, indent=2))

    @classmethod
    async def from_checkpoint(
        cls,
        regions: List[RegionConfig],
        checkpoint: CheckpointConfig,
        rebalance_interval: float,
        heartbeat_interval: float,
    ) -> "PlanetaryOrchestrator":
        orchestrator = cls(regions, checkpoint, rebalance_interval, heartbeat_interval)
        path = checkpoint.resolve_path()
        if not path.exists():
            return orchestrator
        data = json.loads(path.read_text())
        for job_state in data["jobs"]:
            state = JobState.from_dict(job_state)
            orchestrator.jobs[state.job.job_id] = state
            if state.status != "completed":
                await orchestrator.routers[state.job.region].submit(state)
            else:
                orchestrator.metrics.completed_jobs += 1
        orchestrator.metrics.total_jobs = data["metrics"]["total_jobs"]
        orchestrator.metrics.failed_jobs = data["metrics"]["failed_jobs"]
        orchestrator.metrics.reassigned_jobs = data["metrics"]["reassigned_jobs"]
        if orchestrator.metrics.completed_jobs >= orchestrator.metrics.total_jobs:
            orchestrator._completion_event.set()
        return orchestrator

    def snapshot(self) -> Dict[str, object]:
        return {
            "metrics": {
                "total_jobs": self.metrics.total_jobs,
                "completed_jobs": self.metrics.completed_jobs,
                "failed_jobs": self.metrics.failed_jobs,
                "reassigned_jobs": self.metrics.reassigned_jobs,
                "completion_rate": self.metrics.completion_rate(),
                "runtime_seconds": self.metrics.runtime_seconds(),
            },
            "shards": {
                region: {
                    "queued_jobs": router.queued_jobs(),
                    "assignments": router.metrics.assignments,
                    "completed": router.metrics.completed,
                    "requeues": router.metrics.requeues,
                }
                for region, router in self.routers.items()
            },
        }


__all__ = ["PlanetaryOrchestrator", "FabricMetrics"]
