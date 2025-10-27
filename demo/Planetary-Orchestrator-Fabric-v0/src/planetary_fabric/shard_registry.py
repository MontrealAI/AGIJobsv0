"""Sharded job registry for the Planetary Orchestrator Fabric demo."""
from __future__ import annotations

import heapq
import itertools
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Iterable, List, Optional, Tuple

from .job_models import Job, JobStatus, Shard


@dataclass
class ShardStatistics:
    """Aggregated metrics emitted for dashboards and checkpoints."""

    accepted_jobs: int = 0
    completed_jobs: int = 0
    failed_jobs: int = 0
    spillovers_in: int = 0
    spillovers_out: int = 0
    avg_completion_latency_ms: float = 0.0
    latency_measurements: int = 0

    def record_completion(self, latency_ms: float) -> None:
        self.completed_jobs += 1
        self.latency_measurements += 1
        # Exponential moving average keeps state bounded
        alpha = 0.2
        if self.latency_measurements == 1:
            self.avg_completion_latency_ms = latency_ms
        else:
            self.avg_completion_latency_ms = (
                alpha * latency_ms + (1 - alpha) * self.avg_completion_latency_ms
            )

    def serialize(self) -> Dict[str, float]:
        return {
            "accepted_jobs": self.accepted_jobs,
            "completed_jobs": self.completed_jobs,
            "failed_jobs": self.failed_jobs,
            "spillovers_in": self.spillovers_in,
            "spillovers_out": self.spillovers_out,
            "avg_completion_latency_ms": self.avg_completion_latency_ms,
        }

    @classmethod
    def deserialize(cls, data: Dict[str, float]) -> "ShardStatistics":
        stats = cls()
        stats.accepted_jobs = int(data.get("accepted_jobs", 0))
        stats.completed_jobs = int(data.get("completed_jobs", 0))
        stats.failed_jobs = int(data.get("failed_jobs", 0))
        stats.spillovers_in = int(data.get("spillovers_in", 0))
        stats.spillovers_out = int(data.get("spillovers_out", 0))
        stats.avg_completion_latency_ms = float(data.get("avg_completion_latency_ms", 0.0))
        return stats


class ShardRegistry:
    """Priority-aware job queue for a single shard."""

    def __init__(self, shard: Shard) -> None:
        self.shard = shard
        self._priority_queue: List[Tuple[int, float, str]] = []
        self._jobs: Dict[str, Job] = {}
        self._inflight: Dict[str, Job] = {}
        self.stats = ShardStatistics()

    def add_job(self, job: Job) -> None:
        self._jobs[job.job_id] = job
        # Use negative priority (higher priority first) and timestamp for FIFO
        heapq.heappush(self._priority_queue, (-job.priority, job.created_at, job.job_id))
        self.stats.accepted_jobs += 1

    def requeue_job(self, job: Job) -> None:
        """Reinsert an existing job without changing accounting."""

        heapq.heappush(self._priority_queue, (-job.priority, time.time(), job.job_id))

    def next_job(self) -> Optional[Job]:
        while self._priority_queue:
            _, _, job_id = heapq.heappop(self._priority_queue)
            job = self._jobs.get(job_id)
            if job and job.status in {JobStatus.QUEUED, JobStatus.FAILED}:
                self._inflight[job_id] = job
                job.status = JobStatus.QUEUED
                return job
        return None

    def mark_running(self, job_id: str) -> None:
        job = self._inflight.get(job_id) or self._jobs.get(job_id)
        if job:
            job.status = JobStatus.RUNNING

    def complete_job(self, job: Job, latency_ms: float) -> None:
        job.status = JobStatus.COMPLETED
        self._jobs[job.job_id] = job
        self._inflight.pop(job.job_id, None)
        self.stats.record_completion(latency_ms)

    def fail_job(self, job: Job) -> None:
        job.status = JobStatus.FAILED
        self._inflight.pop(job.job_id, None)
        if job.attempts < job.max_attempts:
            job.attempts += 1
            heapq.heappush(self._priority_queue, (-job.priority, time.time(), job.job_id))
        else:
            self.stats.failed_jobs += 1

    def cancel_job(self, job_id: str) -> None:
        job = self._jobs.get(job_id)
        if job:
            job.status = JobStatus.CANCELLED
            self._inflight.pop(job_id, None)

    def queue_depth(self) -> int:
        return len(self._priority_queue)

    def serialize(self) -> Dict[str, object]:
        return {
            "shard": self.shard.value,
            "jobs": {job_id: job.serialize() for job_id, job in self._jobs.items()},
            "priority_queue": list(self._priority_queue),
            "inflight": list(self._inflight.keys()),
            "stats": self.stats.serialize(),
        }

    @classmethod
    def deserialize(cls, data: Dict[str, object]) -> "ShardRegistry":
        shard = Shard(str(data["shard"]))
        registry = cls(shard)
        registry._jobs = {
            job_id: Job.deserialize(job_data)
            for job_id, job_data in dict(data.get("jobs", {})).items()
        }
        registry._priority_queue = [tuple(item) for item in data.get("priority_queue", [])]  # type: ignore[list-item]
        registry._inflight = {
            job_id: registry._jobs[job_id]
            for job_id in data.get("inflight", [])
            if job_id in registry._jobs
        }
        stats_data = data.get("stats")
        if isinstance(stats_data, dict):
            registry.stats = ShardStatistics.deserialize(stats_data)
        return registry


class MultiShardRegistry:
    """Coordinator across multiple shard registries."""

    def __init__(self, shards: Iterable[Shard]) -> None:
        self.registries: Dict[Shard, ShardRegistry] = {shard: ShardRegistry(shard) for shard in shards}

    def get_registry(self, shard: Shard) -> ShardRegistry:
        return self.registries[shard]

    def add_job(self, job: Job) -> None:
        self.registries[job.shard].add_job(job)

    def serialize(self) -> Dict[str, object]:
        return {shard.value: registry.serialize() for shard, registry in self.registries.items()}

    @classmethod
    def deserialize(cls, data: Dict[str, object]) -> "MultiShardRegistry":
        shards = [Shard(shard_name) for shard_name in data.keys()]
        registry = cls(shards)
        registry.registries = {
            Shard(shard_name): ShardRegistry.deserialize(registry_data)
            for shard_name, registry_data in data.items()
        }
        return registry

    def total_queue_depth(self) -> Dict[Shard, int]:
        return {shard: registry.queue_depth() for shard, registry in self.registries.items()}
