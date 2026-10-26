from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Set


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

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any], *, now: Optional[datetime] = None) -> JobSpec:
        """Create a :class:`JobSpec` from declarative metadata."""

        base_time = now or datetime.now(timezone.utc)
        try:
            title = str(payload["title"])
            description = str(payload["description"])
            required_skills_raw = payload.get("required_skills", [])
            if isinstance(required_skills_raw, str):
                required_skills = [required_skills_raw]
            elif isinstance(required_skills_raw, Iterable):
                required_skills = [str(skill) for skill in required_skills_raw]
            else:
                raise TypeError("required_skills must be iterable")
            if not required_skills:
                raise ValueError("required_skills must not be empty")
            reward_tokens = float(payload["reward_tokens"])
        except KeyError as exc:  # pragma: no cover - validated by configuration tests
            raise KeyError(f"Missing required job field: {exc.args[0]}") from exc

        deadline_value = payload.get("deadline")
        deadline: datetime
        if isinstance(deadline_value, datetime):
            deadline = deadline_value
        elif isinstance(deadline_value, str):
            deadline = datetime.fromisoformat(deadline_value)
        else:
            if "deadline_hours" in payload:
                delta = timedelta(hours=float(payload["deadline_hours"]))
            elif "deadline_minutes" in payload:
                delta = timedelta(minutes=float(payload["deadline_minutes"]))
            elif "deadline_seconds" in payload:
                delta = timedelta(seconds=float(payload["deadline_seconds"]))
            else:
                delta = timedelta(hours=12)
            deadline = base_time + delta
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)

        if "validation_window" in payload and isinstance(payload["validation_window"], timedelta):
            validation_window = payload["validation_window"]
        elif "validation_window_seconds" in payload:
            validation_window = timedelta(seconds=float(payload["validation_window_seconds"]))
        elif "validation_window_minutes" in payload:
            validation_window = timedelta(minutes=float(payload["validation_window_minutes"]))
        else:
            validation_window = timedelta(hours=float(payload.get("validation_window_hours", 1)))

        parent_id = payload.get("parent_id")
        parent_id_str = str(parent_id) if parent_id is not None else None
        stake_required = float(payload.get("stake_required", 0.0))
        energy_budget = float(payload.get("energy_budget", 0.0))
        compute_budget = float(payload.get("compute_budget", 0.0))
        metadata_value = payload.get("metadata", {})
        if isinstance(metadata_value, Mapping):
            metadata = dict(metadata_value)
        else:
            raise TypeError("metadata must be a mapping")

        return cls(
            title=title,
            description=description,
            required_skills=required_skills,
            reward_tokens=reward_tokens,
            deadline=deadline,
            validation_window=validation_window,
            parent_id=parent_id_str,
            stake_required=stake_required,
            energy_budget=energy_budget,
            compute_budget=compute_budget,
            metadata=metadata,
        )


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
    validator_reward_pool: float = 0.0
    reserved_energy: float = 0.0
    reserved_compute: float = 0.0
    result_summary: Optional[str] = None
    validator_commits: Dict[str, str] = field(default_factory=dict)
    validator_votes: Dict[str, bool] = field(default_factory=dict)
    validators_with_stake: Set[str] = field(default_factory=set)
    deadline_event_id: Optional[str] = None
    commit_event_id: Optional[str] = None
    finalization_event_id: Optional[str] = None
    commit_deadline: Optional[datetime] = None
    reveal_deadline: Optional[datetime] = None

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
            "validator_reward_pool": self.validator_reward_pool,
            "reserved_energy": self.reserved_energy,
            "reserved_compute": self.reserved_compute,
            "result_summary": self.result_summary,
            "validator_commits": dict(self.validator_commits),
            "validator_votes": dict(self.validator_votes),
            "validators_with_stake": list(self.validators_with_stake),
            "deadline_event_id": self.deadline_event_id,
            "commit_event_id": self.commit_event_id,
            "finalization_event_id": self.finalization_event_id,
            "commit_deadline": self.commit_deadline.isoformat() if self.commit_deadline else None,
            "reveal_deadline": self.reveal_deadline.isoformat() if self.reveal_deadline else None,
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

    def delete_job(self, job_id: str) -> None:
        record = self._jobs.pop(job_id, None)
        if record is None:
            return
        parent_id = record.spec.parent_id
        if parent_id and parent_id in self._children:
            children = self._children[parent_id]
            if job_id in children:
                children.remove(job_id)
            if not children:
                self._children.pop(parent_id, None)

    def jobs_by_status(self, status: JobStatus) -> List[JobRecord]:
        return [job for job in self._jobs.values() if job.status == status]

    def to_mapping(self) -> Dict[str, JobRecord]:
        return dict(self._jobs)
