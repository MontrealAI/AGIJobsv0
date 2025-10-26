"""Job registry and lifecycle models for the omega upgrade."""

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
    priority: int = 1


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
    timeline: List[Dict[str, str]] = field(default_factory=list)

    def is_terminal(self) -> bool:
        return self.status in {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}

    def record_event(self, event: str, **fields: str) -> None:
        self.timeline.append({"event": event, "timestamp": datetime.now(timezone.utc).isoformat(), **fields})


class JobRegistry:
    """In-memory hierarchical job registry."""

    def __init__(self) -> None:
        self._records: Dict[str, JobRecord] = {}
        self._children: Dict[Optional[str], List[str]] = {}
        self._id_counter = itertools.count(1)

    def _generate_job_id(self) -> str:
        return f"OMEGA-JOB-{next(self._id_counter):06d}"

    def create_job(self, spec: JobSpec) -> JobRecord:
        job_id = self._generate_job_id()
        record = JobRecord(job_id=job_id, spec=spec)
        record.record_event("created", title=spec.title)
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

    def rehydrate(self, records: Iterable[JobRecord]) -> None:
        self._records = {}
        self._children = {}
        max_identifier = 0
        for record in records:
            self._records[record.job_id] = record
            parent_id = record.spec.parent_id
            self._children.setdefault(parent_id, []).append(record.job_id)
            self._children.setdefault(record.job_id, [])
            try:
                _, numeric = record.job_id.rsplit("-", 1)
                max_identifier = max(max_identifier, int(numeric))
            except (ValueError, IndexError):
                continue
        self._id_counter = itertools.count(max_identifier + 1)

    def mark_completed(self, job_id: str, summary: str, energy_used: float, compute_used: float) -> JobRecord:
        record = self._records[job_id]
        record.status = JobStatus.COMPLETED
        record.result_summary = summary
        record.energy_used += energy_used
        record.compute_used += compute_used
        record.record_event("completed", summary=summary)
        return record

    def mark_failed(self, job_id: str, summary: str) -> JobRecord:
        record = self._records[job_id]
        record.status = JobStatus.FAILED
        record.result_summary = summary
        record.record_event("failed", summary=summary)
        return record

    def mark_cancelled(self, job_id: str, summary: str) -> JobRecord:
        record = self._records[job_id]
        record.status = JobStatus.CANCELLED
        record.result_summary = summary
        record.record_event("cancelled", summary=summary)
        return record

    def mark_in_progress(self, job_id: str, agent_name: str, stake_locked: float) -> JobRecord:
        record = self._records[job_id]
        record.status = JobStatus.IN_PROGRESS
        record.assigned_agent = agent_name
        record.stake_locked = stake_locked
        record.record_event("assigned", agent=agent_name)
        return record

    def all_terminal(self, job_id: str) -> bool:
        return all(self._records[child_id].is_terminal() for child_id in self.children_of(job_id))

    def lineage(self, job_id: str) -> List[str]:
        chain: List[str] = []
        current = job_id
        while current is not None:
            chain.append(current)
            parent = self._records[current].spec.parent_id
            current = parent
        return list(reversed(chain))
