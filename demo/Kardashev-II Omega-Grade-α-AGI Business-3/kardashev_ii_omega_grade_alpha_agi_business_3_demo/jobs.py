"""Job graph and registry primitives for the Omega-grade demo."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Dict, Iterable, Iterator, List, Optional


class JobStatus(Enum):
    """Lifecycle state for a job."""

    POSTED = "posted"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FINALIZED = "finalized"
    CANCELLED = "cancelled"
    FAILED = "failed"


@dataclass
class JobSpec:
    """Structured specification for a job."""

    title: str
    description: str
    required_skills: List[str]
    reward_tokens: float
    deadline: datetime
    validation_window: timedelta
    parent_id: Optional[str] = None
    stake_required: float = 0.0
    energy_budget: float = 0.0
    compute_budget: float = 0.0
    metadata: Dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, object]:
        return {
            "title": self.title,
            "description": self.description,
            "required_skills": list(self.required_skills),
            "reward_tokens": self.reward_tokens,
            "deadline": self.deadline.isoformat(),
            "validation_window_seconds": self.validation_window.total_seconds(),
            "parent_id": self.parent_id,
            "stake_required": self.stake_required,
            "energy_budget": self.energy_budget,
            "compute_budget": self.compute_budget,
            "metadata": dict(self.metadata),
        }


@dataclass
class JobRecord:
    """Tracked instance of a job."""

    job_id: str
    spec: JobSpec
    status: JobStatus
    created_at: datetime
    assigned_agent: Optional[str] = None
    energy_used: float = 0.0
    compute_used: float = 0.0
    stake_locked: float = 0.0
    result_summary: Optional[str] = None
    validator_commits: Dict[str, str] = field(default_factory=dict)
    validator_votes: Dict[str, bool] = field(default_factory=dict)

    def to_serializable(self) -> Dict[str, object]:
        return {
            "job_id": self.job_id,
            "spec": self.spec.to_dict(),
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "assigned_agent": self.assigned_agent,
            "energy_used": self.energy_used,
            "compute_used": self.compute_used,
            "stake_locked": self.stake_locked,
            "result_summary": self.result_summary,
            "validator_commits": dict(self.validator_commits),
            "validator_votes": dict(self.validator_votes),
        }


class JobRegistry:
    """Manage the directed acyclic graph of jobs."""

    def __init__(self) -> None:
        self._jobs: Dict[str, JobRecord] = {}
        self._children: Dict[str, List[str]] = {}

    def create_job(self, spec: JobSpec) -> JobRecord:
        job_id = spec.metadata.get("job_id")
        if not isinstance(job_id, str) or not job_id:
            job_id = uuid.uuid4().hex
        spec.metadata["job_id"] = job_id
        record = JobRecord(
            job_id=job_id,
            spec=spec,
            status=JobStatus.POSTED,
            created_at=datetime.now(timezone.utc),
        )
        self._jobs[job_id] = record
        if spec.parent_id:
            self._children.setdefault(spec.parent_id, []).append(job_id)
        return record

    def rehydrate(self, records: Iterable[JobRecord]) -> None:
        self._jobs = {record.job_id: record for record in records}
        self._children.clear()
        for record in records:
            if record.spec.parent_id:
                self._children.setdefault(record.spec.parent_id, []).append(record.job_id)

    def iter_jobs(self) -> Iterator[JobRecord]:
        return iter(self._jobs.values())

    def get_job(self, job_id: str) -> JobRecord:
        try:
            return self._jobs[job_id]
        except KeyError as exc:  # pragma: no cover - defensive guard
            raise KeyError(f"Unknown job {job_id}") from exc

    def children_of(self, job_id: str) -> List[JobRecord]:
        return [self._jobs[child_id] for child_id in self._children.get(job_id, [])]

    def mark_in_progress(self, job_id: str, agent: str, stake_locked: float) -> JobRecord:
        record = self.get_job(job_id)
        record.status = JobStatus.IN_PROGRESS
        record.assigned_agent = agent
        record.stake_locked = stake_locked
        return record

    def mark_completed(self, job_id: str, summary: str, energy_used: float, compute_used: float) -> JobRecord:
        record = self.get_job(job_id)
        record.status = JobStatus.COMPLETED
        record.result_summary = summary
        record.energy_used = energy_used
        record.compute_used = compute_used
        return record

    def mark_failed(self, job_id: str, reason: str) -> JobRecord:
        record = self.get_job(job_id)
        record.status = JobStatus.FAILED
        record.result_summary = reason
        return record

    def mark_cancelled(self, job_id: str, reason: str) -> JobRecord:
        record = self.get_job(job_id)
        record.status = JobStatus.CANCELLED
        record.result_summary = reason
        return record

    def finalize_job(self, job_id: str) -> JobRecord:
        record = self.get_job(job_id)
        record.status = JobStatus.FINALIZED
        return record

    def jobs_by_status(self, status: JobStatus) -> List[JobRecord]:
        return [job for job in self._jobs.values() if job.status == status]

    def to_mapping(self) -> Dict[str, JobRecord]:
        return dict(self._jobs)

