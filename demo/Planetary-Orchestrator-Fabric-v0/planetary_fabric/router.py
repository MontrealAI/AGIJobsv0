"""Regional router implementation for the planetary fabric."""
from __future__ import annotations

import asyncio
import contextlib
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .jobs import Job, JobState
from .nodes import Node, NodeOfflineError


@dataclass
class RouterMetrics:
    assignments: int = 0
    requeues: int = 0
    completed: int = 0
    failed: int = 0


class RegionalRouter:
    """Dispatches jobs to local nodes while monitoring their health."""

    def __init__(self, region: str) -> None:
        self.region = region
        self.queue: asyncio.PriorityQueue[tuple[int, str]] = asyncio.PriorityQueue()
        self._job_lookup: Dict[str, Job] = {}
        self._nodes: List[Node] = []
        self._lock = asyncio.Lock()
        self._running = False
        self._worker_tasks: Dict[str, asyncio.Task[None]] = {}
        self.metrics = RouterMetrics()
        self._on_complete: Optional[asyncio.Queue[JobState]] = None
        self._on_requeue: Optional[asyncio.Queue[str]] = None

    async def start(self, on_complete: asyncio.Queue[JobState], on_requeue: asyncio.Queue[str]) -> None:
        self._on_complete = on_complete
        self._on_requeue = on_requeue
        self._running = True
        async with self._lock:
            for node in self._nodes:
                self._launch_worker(node)

    async def shutdown(self) -> None:
        self._running = False
        async with self._lock:
            for worker in list(self._worker_tasks.values()):
                worker.cancel()
            for worker in list(self._worker_tasks.values()):
                try:
                    await worker
                except asyncio.CancelledError:
                    pass
            self._worker_tasks.clear()

    async def add_node(self, node: Node) -> None:
        async with self._lock:
            self._nodes.append(node)
            if self._running:
                self._launch_worker(node)

    async def remove_node(self, node: Node) -> None:
        async with self._lock:
            if node in self._nodes:
                self._nodes.remove(node)
            worker = self._worker_tasks.pop(node.config.node_id, None)
            if worker is not None:
                worker.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await worker

    def queued_jobs(self) -> int:
        return self.queue.qsize()

    async def submit(self, job_state: JobState) -> None:
        self._job_lookup[job_state.job.job_id] = job_state.job
        await self.queue.put((job_state.job.priority, job_state.job.job_id))

    async def take_job(self) -> Optional[Job]:
        try:
            priority, job_id = self.queue.get_nowait()
        except asyncio.QueueEmpty:
            return None
        job = self._job_lookup[job_id]
        return job

    async def requeue(self, job: Job) -> None:
        await self.queue.put((job.priority, job.job_id))
        self.metrics.requeues += 1

    async def _node_worker(self, node: Node) -> None:
        assert self._on_complete is not None
        assert self._on_requeue is not None
        while self._running:
            priority_job: Optional[tuple[int, str]] = None
            try:
                priority_job = await asyncio.wait_for(self.queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            if priority_job is None:
                continue
            _, job_id = priority_job
            job = self._job_lookup[job_id]
            try:
                result = await node.process(job)
                self.metrics.assignments += 1
                state = JobState(job=job, status="completed", result=result, assigned_node=node.config.node_id)
                self.metrics.completed += 1
                await self._on_complete.put(state)
            except NodeOfflineError:
                self.metrics.failed += 1
                await self._on_requeue.put(job.job_id)
                await self.queue.put((job.priority, job.job_id))
                break
            finally:
                self.queue.task_done()

    def _launch_worker(self, node: Node) -> None:
        task = asyncio.create_task(self._node_worker(node))
        self._worker_tasks[node.config.node_id] = task


__all__ = ["RegionalRouter", "RouterMetrics"]
