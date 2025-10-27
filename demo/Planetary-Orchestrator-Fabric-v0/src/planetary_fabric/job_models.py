"""Core data models for the Planetary Orchestrator Fabric demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Optional, Set
import time


class Shard(str, Enum):
    """Geographical shards that segment the planetary job fabric."""

    EARTH = "earth"
    LUNA = "luna"
    MARS = "mars"
    HELIOS = "helios"
    EDGE = "edge"


class JobStatus(str, Enum):
    """State machine for a job's lifecycle."""

    QUEUED = "queued"
    ASSIGNED = "assigned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class NodeHealth(str, Enum):
    """Health states for registered agent nodes."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    OFFLINE = "offline"


@dataclass
class Job:
    """A unit of work managed by the fabric."""

    job_id: str
    shard: Shard
    payload: Dict[str, str]
    latency_budget_ms: int
    priority: int = 0
    status: JobStatus = JobStatus.QUEUED
    assigned_node_id: Optional[str] = None
    result: Optional["JobResult"] = None
    created_at: float = field(default_factory=lambda: time.time())
    attempts: int = 0
    max_attempts: int = 3

    def serialize(self) -> Dict[str, object]:
        """Serialize the job for persistence."""

        return {
            "job_id": self.job_id,
            "shard": self.shard.value,
            "payload": self.payload,
            "latency_budget_ms": self.latency_budget_ms,
            "priority": self.priority,
            "status": self.status.value,
            "assigned_node_id": self.assigned_node_id,
            "result": self.result.serialize() if self.result else None,
            "created_at": self.created_at,
            "attempts": self.attempts,
            "max_attempts": self.max_attempts,
        }

    @classmethod
    def deserialize(cls, data: Dict[str, object]) -> "Job":
        """Rehydrate a job from persisted data."""

        job = cls(
            job_id=str(data["job_id"]),
            shard=Shard(str(data["shard"])),
            payload=dict(data["payload"]),
            latency_budget_ms=int(data["latency_budget_ms"]),
            priority=int(data["priority"]),
        )
        job.status = JobStatus(str(data["status"]))
        job.assigned_node_id = data.get("assigned_node_id")
        result = data.get("result")
        if result:
            job.result = JobResult.deserialize(result)  # type: ignore[arg-type]
        job.created_at = float(data["created_at"])
        job.attempts = int(data.get("attempts", 0))
        job.max_attempts = int(data.get("max_attempts", job.max_attempts))
        return job


@dataclass
class JobResult:
    """Result produced by an agent node."""

    output: Dict[str, str]
    completed_at: float = field(default_factory=lambda: time.time())
    metadata: Dict[str, object] = field(default_factory=dict)

    def serialize(self) -> Dict[str, object]:
        return {
            "output": self.output,
            "completed_at": self.completed_at,
            "metadata": self.metadata,
        }

    @classmethod
    def deserialize(cls, data: Dict[str, object]) -> "JobResult":
        return cls(
            output=dict(data["output"]),
            completed_at=float(data["completed_at"]),
            metadata=dict(data.get("metadata", {})),
        )


@dataclass
class Node:
    """Representation of a containerised agent node."""

    node_id: str
    shard: Shard
    capacity: int
    specialties: Set[str]
    health: NodeHealth = NodeHealth.HEALTHY
    current_load: int = 0
    last_heartbeat: float = field(default_factory=lambda: time.time())
    metadata: Dict[str, object] = field(default_factory=dict)

    def is_available(self) -> bool:
        return self.health != NodeHealth.OFFLINE and self.current_load < self.capacity

    def heartbeat(self, health: Optional[NodeHealth] = None) -> None:
        self.last_heartbeat = time.time()
        if health:
            self.health = health

    def serialize(self) -> Dict[str, object]:
        return {
            "node_id": self.node_id,
            "shard": self.shard.value,
            "capacity": self.capacity,
            "specialties": sorted(self.specialties),
            "health": self.health.value,
            "current_load": self.current_load,
            "last_heartbeat": self.last_heartbeat,
            "metadata": self.metadata,
        }

    @classmethod
    def deserialize(cls, data: Dict[str, object]) -> "Node":
        node = cls(
            node_id=str(data["node_id"]),
            shard=Shard(str(data["shard"])),
            capacity=int(data["capacity"]),
            specialties=set(data.get("specialties", [])),
        )
        node.health = NodeHealth(str(data.get("health", node.health.value)))
        node.current_load = int(data.get("current_load", 0))
        node.last_heartbeat = float(data.get("last_heartbeat", time.time()))
        node.metadata = dict(data.get("metadata", {}))
        return node


@dataclass
class Assignment:
    """Active job assignment for tracking metrics and checkpointing."""

    job_id: str
    node_id: str
    shard: Shard
    assigned_at: float = field(default_factory=lambda: time.time())
    spillover: bool = False

    def serialize(self) -> Dict[str, object]:
        return {
            "job_id": self.job_id,
            "node_id": self.node_id,
            "shard": self.shard.value,
            "assigned_at": self.assigned_at,
            "spillover": self.spillover,
        }

    @classmethod
    def deserialize(cls, data: Dict[str, object]) -> "Assignment":
        return cls(
            job_id=str(data["job_id"]),
            node_id=str(data["node_id"]),
            shard=Shard(str(data["shard"])),
            assigned_at=float(data["assigned_at"]),
            spillover=bool(data.get("spillover", False)),
        )
