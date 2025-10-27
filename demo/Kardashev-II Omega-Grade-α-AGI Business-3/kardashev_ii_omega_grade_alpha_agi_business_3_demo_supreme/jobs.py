"""Job model and registry utilities for the Supreme demo."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Dict, List, Optional


class JobStatus(Enum):
    DRAFT = auto()
    POSTED = auto()
    IN_PROGRESS = auto()
    VALIDATING = auto()
    COMPLETE = auto()
    FAILED = auto()
    CANCELLED = auto()


@dataclass(slots=True)
class JobSpec:
    title: str
    description: str
    reward: int
    stake_required: int
    energy_budget: float
    compute_budget: float
    deadline_epoch: float
    parent_id: Optional[str] = None
    employer: str = "owner"
    required_skills: List[str] = field(default_factory=list)


@dataclass(slots=True)
class Job:
    job_id: str
    spec: JobSpec
    status: JobStatus = JobStatus.DRAFT
    created_epoch: float = field(default_factory=time.time)
    started_epoch: Optional[float] = None
    completed_epoch: Optional[float] = None
    worker: Optional[str] = None
    validator_votes: Dict[str, bool] = field(default_factory=dict)
    child_jobs: List[str] = field(default_factory=list)
    result_reference: Optional[str] = None
    energy_used: float = 0.0
    compute_used: float = 0.0
    notes: List[str] = field(default_factory=list)

    def mark_started(self, worker: str) -> None:
        self.status = JobStatus.IN_PROGRESS
        self.started_epoch = time.time()
        self.worker = worker

    def mark_validating(self) -> None:
        self.status = JobStatus.VALIDATING

    def mark_complete(self, result_reference: str) -> None:
        self.status = JobStatus.COMPLETE
        self.completed_epoch = time.time()
        self.result_reference = result_reference

    def mark_failed(self, note: str) -> None:
        self.status = JobStatus.FAILED
        self.completed_epoch = time.time()
        self.notes.append(note)

    def cancel(self, note: str) -> None:
        self.status = JobStatus.CANCELLED
        self.completed_epoch = time.time()
        self.notes.append(note)


class JobRegistry:
    """In-memory hierarchical job registry."""

    def __init__(self) -> None:
        self._jobs: Dict[str, Job] = {}
        self._sequence: int = 0

    def create_job(self, spec: JobSpec) -> Job:
        self._sequence += 1
        job_id = f"JOB-{self._sequence:06d}"
        job = Job(job_id=job_id, spec=spec, status=JobStatus.POSTED)
        self._jobs[job_id] = job
        if spec.parent_id:
            parent = self._jobs[spec.parent_id]
            parent.child_jobs.append(job_id)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    def all_jobs(self) -> List[Job]:
        return list(self._jobs.values())

    def active_jobs(self) -> List[Job]:
        return [job for job in self._jobs.values() if job.status in {JobStatus.POSTED, JobStatus.IN_PROGRESS, JobStatus.VALIDATING}]

    def serialize(self) -> Dict[str, Dict[str, object]]:
        return {job_id: self._serialize_job(job) for job_id, job in self._jobs.items()}

    @staticmethod
    def _serialize_job(job: Job) -> Dict[str, object]:
        return {
            "job_id": job.job_id,
            "spec": {
                "title": job.spec.title,
                "description": job.spec.description,
                "reward": job.spec.reward,
                "stake_required": job.spec.stake_required,
                "energy_budget": job.spec.energy_budget,
                "compute_budget": job.spec.compute_budget,
                "deadline_epoch": job.spec.deadline_epoch,
                "parent_id": job.spec.parent_id,
                "employer": job.spec.employer,
                "required_skills": job.spec.required_skills,
            },
            "status": job.status.name,
            "created_epoch": job.created_epoch,
            "started_epoch": job.started_epoch,
            "completed_epoch": job.completed_epoch,
            "worker": job.worker,
            "validator_votes": job.validator_votes,
            "child_jobs": job.child_jobs,
            "result_reference": job.result_reference,
            "energy_used": job.energy_used,
            "compute_used": job.compute_used,
            "notes": job.notes,
        }

    @classmethod
    def from_dict(cls, payload: Dict[str, Dict[str, object]]) -> "JobRegistry":
        registry = cls()
        for job_id, job_payload in payload.items():
            spec_payload = job_payload["spec"]
            spec = JobSpec(
                title=spec_payload["title"],
                description=spec_payload["description"],
                reward=int(spec_payload["reward"]),
                stake_required=int(spec_payload["stake_required"]),
                energy_budget=float(spec_payload["energy_budget"]),
                compute_budget=float(spec_payload["compute_budget"]),
                deadline_epoch=float(spec_payload["deadline_epoch"]),
                parent_id=spec_payload.get("parent_id"),
                employer=spec_payload.get("employer", "owner"),
                required_skills=list(spec_payload.get("required_skills", [])),
            )
            job = Job(job_id=job_id, spec=spec)
            job.status = JobStatus[job_payload["status"]]
            job.created_epoch = float(job_payload["created_epoch"])
            job.started_epoch = job_payload.get("started_epoch")
            job.completed_epoch = job_payload.get("completed_epoch")
            job.worker = job_payload.get("worker")
            job.validator_votes = dict(job_payload.get("validator_votes", {}))
            job.child_jobs = list(job_payload.get("child_jobs", []))
            job.result_reference = job_payload.get("result_reference")
            job.energy_used = float(job_payload.get("energy_used", 0.0))
            job.compute_used = float(job_payload.get("compute_used", 0.0))
            job.notes = list(job_payload.get("notes", []))
            registry._jobs[job_id] = job
            registry._sequence = max(registry._sequence, int(job_id.split("-")[-1]))
        return registry
