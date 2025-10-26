"""State containers for the Omega-grade demo."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Mapping, MutableMapping, Optional


class JobStatus(str, Enum):
    POSTED = "posted"
    IN_PROGRESS = "in_progress"
    AWAITING_VALIDATION = "awaiting_validation"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class CommitRecord:
    validator: str
    commit_hash: str
    committed_at: datetime

    def to_dict(self) -> Mapping[str, Any]:
        return {
            "validator": self.validator,
            "commit_hash": self.commit_hash,
            "committed_at": self.committed_at.isoformat(),
        }


@dataclass
class RevealRecord:
    validator: str
    verdict: bool
    revealed_at: datetime

    def to_dict(self) -> Mapping[str, Any]:
        return {
            "validator": self.validator,
            "verdict": self.verdict,
            "revealed_at": self.revealed_at.isoformat(),
        }


@dataclass
class Job:
    job_id: str
    spec: MutableMapping[str, Any]
    employer: str
    reward: float
    stake_required: float
    deadline: datetime
    parent_id: Optional[str] = None
    status: JobStatus = JobStatus.POSTED
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    assignee: Optional[str] = None
    result: Optional[MutableMapping[str, Any]] = None
    energy_cost: float = 0.0
    compute_cost: float = 0.0
    children: List[str] = field(default_factory=list)
    commits: List[CommitRecord] = field(default_factory=list)
    reveals: List[RevealRecord] = field(default_factory=list)

    def add_child(self, child_id: str) -> None:
        if child_id not in self.children:
            self.children.append(child_id)
            self.touch()

    def touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["status"] = self.status.value
        payload["deadline"] = self.deadline.isoformat()
        payload["created_at"] = self.created_at.isoformat()
        payload["updated_at"] = self.updated_at.isoformat()
        payload["commits"] = [record.to_dict() for record in self.commits]
        payload["reveals"] = [record.to_dict() for record in self.reveals]
        return payload


@dataclass
class Checkpoint:
    created_at: datetime
    jobs: List[Job]
    resource_state: Mapping[str, Any]
    config: Mapping[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "created_at": self.created_at.isoformat(),
            "jobs": [job.to_dict() for job in self.jobs],
            "resource_state": dict(self.resource_state),
            "config": dict(self.config),
        }


def deadline_from_now(hours: float) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=hours)
