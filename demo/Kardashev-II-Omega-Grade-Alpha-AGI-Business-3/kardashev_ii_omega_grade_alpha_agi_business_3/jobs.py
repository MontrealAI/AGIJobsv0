"""Job registry and lifecycle models."""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Dict, Iterable, List, Optional


class JobStatus(str, Enum):
    """Lifecycle states for a job."""

    POSTED = "posted"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(slots=True)
class JobSpec:
    """Specification describing a job's requirements."""

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
    metadata: Dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class JobRecord:
    """Runtime record for an active job."""

    job_id: str
    spec: JobSpec
    status: JobStatus = JobStatus.POSTED
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    assigned_agent: Optional[str] = None
    energy_used: float = 0.0
    compute_used: float = 0.0
    stake_locked: float = 0.0
    result_summary: Optional[str] = None
    validator_commits: Dict[str, str] = field(default_factory=dict)
    validator_votes: Dict[str, bool] = field(default_factory=dict)

    def is_terminal(self) -> bool:
        return self.status in {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}


class JobRegistry:
    """In-memory hierarchical job registry."""

    def __init__(self) -> None:
        self._records: Dict[str, JobRecord] = {}
        self._children: Dict[Optional[str], List[str]] = {}
        self._id_counter = itertools.count(1)

    def _generate_job_id(self) -> str:
        return f"JOB-{next(self._id_counter):06d}"

    def create_job(self, spec: JobSpec) -> JobRecord:
        job_id = self._generate_job_id()
        record = JobRecord(job_id=job_id, spec=spec)
        self._records[job_id] = record
        self._children.setdefault(spec.parent_id, []).append(job_id)
        self._children.setdefault(job_id, [])
        return record

    def get_job(self, job_id: str) -> JobRecord:
        return self._records[job_id]

    def iter_jobs(self) -> Iterable[JobRecord]:
        return self._records.values()

    def children_of(self, job_id: Optional[str]) -> List[str]:
        return list(self._children.get(job_id, []))

    def mark_completed(self, job_id: str, summary: str, energy_used: float, compute_used: float) -> JobRecord:
        record = self._records[job_id]
        record.status = JobStatus.COMPLETED
        record.result_summary = summary
        record.energy_used += energy_used
        record.compute_used += compute_used
        return record

    def mark_failed(self, job_id: str, summary: str) -> JobRecord:
        record = self._records[job_id]
        record.status = JobStatus.FAILED
        record.result_summary = summary
        return record

    def mark_cancelled(self, job_id: str, summary: str) -> JobRecord:
        record = self._records[job_id]
        record.status = JobStatus.CANCELLED
        record.result_summary = summary
        return record

    def mark_in_progress(self, job_id: str, agent_name: str, stake_locked: float) -> JobRecord:
        record = self._records[job_id]
        record.status = JobStatus.IN_PROGRESS
        record.assigned_agent = agent_name
        record.stake_locked = stake_locked
        return record

    def all_terminal(self, job_id: str) -> bool:
        return all(self._records[child_id].is_terminal() for child_id in self.children_of(job_id))
