"""Job graph and lifecycle primitives for the Kardashev-II Omega-Grade α-AGI Business 3 demo."""

from __future__ import annotations

import enum
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional


class JobStatus(str, enum.Enum):
    """Represents the lifecycle state for a job."""

    PENDING = "pending"
    ACTIVE = "active"
    AWAITING_VALIDATION = "awaiting_validation"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


@dataclass(slots=True)
class JobSpec:
    """Human-readable description of the job requirements."""

    title: str
    description: str
    reward_tokens: float
    stake_required: float
    energy_budget: float
    compute_budget: float
    deadline_s: float
    parent_id: Optional[str] = None
    employer: Optional[str] = None
    skills: List[str] = field(default_factory=list)
    metadata: Dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class JobRecord:
    """Runtime record for an instantiated job in the system."""

    spec: JobSpec
    job_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    created_at: float = field(default_factory=time.time)
    status: JobStatus = JobStatus.PENDING
    assigned_agent: Optional[str] = None
    energy_used: float = 0.0
    compute_used: float = 0.0
    stake_locked: float = 0.0
    validator_commits: Dict[str, str] = field(default_factory=dict)
    validator_reveals: Dict[str, bool] = field(default_factory=dict)
    children: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, object]:
        return {
            "job_id": self.job_id,
            "status": self.status.value,
            "created_at": self.created_at,
            "parent_id": self.spec.parent_id,
            "employer": self.spec.employer,
            "assigned_agent": self.assigned_agent,
            "energy_used": self.energy_used,
            "compute_used": self.compute_used,
            "stake_locked": self.stake_locked,
            "reward_tokens": self.spec.reward_tokens,
            "stake_required": self.spec.stake_required,
            "energy_budget": self.spec.energy_budget,
            "compute_budget": self.spec.compute_budget,
            "deadline_s": self.spec.deadline_s,
            "title": self.spec.title,
            "description": self.spec.description,
            "skills": list(self.spec.skills),
            "metadata": dict(self.spec.metadata),
            "validator_commits": dict(self.validator_commits),
            "validator_reveals": dict(self.validator_reveals),
            "children": list(self.children),
        }


class JobRegistry:
    """A local in-memory registry tracking all jobs posted in the demo."""

    def __init__(self) -> None:
        self._jobs: Dict[str, JobRecord] = {}

    def create(self, spec: JobSpec, *, job_id: str | None = None) -> JobRecord:
        record = JobRecord(spec=spec)
        if job_id is not None:
            record.job_id = job_id
        self._jobs[record.job_id] = record
        parent = spec.parent_id
        if parent and parent in self._jobs:
            self._jobs[parent].children.append(record.job_id)
        return record

    def get(self, job_id: str) -> JobRecord:
        try:
            return self._jobs[job_id]
        except KeyError as exc:
            raise KeyError(f"Unknown job: {job_id}") from exc

    def update_status(self, job_id: str, status: JobStatus) -> None:
        record = self.get(job_id)
        record.status = status

    def jobs(self) -> Iterable[JobRecord]:
        return list(self._jobs.values())

    def active_jobs(self) -> List[JobRecord]:
        return [job for job in self._jobs.values() if job.status in {JobStatus.ACTIVE, JobStatus.AWAITING_VALIDATION}]

    def to_dict(self) -> Dict[str, Dict[str, object]]:
        return {job_id: record.to_dict() for job_id, record in self._jobs.items()}

