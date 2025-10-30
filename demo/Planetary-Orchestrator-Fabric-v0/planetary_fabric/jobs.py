"""Job models and helpers for the Planetary Orchestrator Fabric."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional

from .config import DemoJobPayload


@dataclass
class Job:
    """Represents a single piece of work within the fabric."""

    job_id: str
    region: str
    payload: DemoJobPayload
    priority: int = 0


@dataclass
class JobState:
    """Mutable state tracked by the orchestrator for each job."""

    job: Job
    status: str = "pending"
    assigned_node: Optional[str] = None
    attempts: int = 0
    result: Optional[Dict[str, str]] = None

    def to_dict(self) -> Dict[str, object]:
        return {
            "job_id": self.job.job_id,
            "region": self.job.region,
            "payload": {
                "description": self.job.payload.description,
                "complexity": self.job.payload.complexity,
                "reward": self.job.payload.reward,
                "metadata": self.job.payload.metadata,
            },
            "priority": self.job.priority,
            "status": self.status,
            "assigned_node": self.assigned_node,
            "attempts": self.attempts,
            "result": self.result,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, object]) -> "JobState":
        payload_data = data["payload"]
        payload = DemoJobPayload(
            description=payload_data["description"],
            complexity=payload_data["complexity"],
            reward=payload_data["reward"],
            metadata=dict(payload_data["metadata"]),
        )
        job = Job(
            job_id=str(data["job_id"]),
            region=str(data["region"]),
            payload=payload,
            priority=int(data.get("priority", 0)),
        )
        state = cls(job=job)
        state.status = str(data["status"])
        state.assigned_node = data.get("assigned_node")
        state.attempts = int(data.get("attempts", 0))
        state.result = data.get("result")
        return state


__all__ = ["Job", "JobState"]
