from __future__ import annotations

import hashlib
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


class JobStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    VALIDATING = "validating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Job:
    title: str
    reward: float
    deadline: datetime
    energy_budget: float
    compute_budget: float
    description: str
    skills: List[str]
    owner: str
    job_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    parent_id: Optional[str] = None
    status: JobStatus = JobStatus.PENDING
    assigned_agent: Optional[str] = None
    energy_used: float = 0.0
    compute_used: float = 0.0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    result: Optional[Dict[str, Any]] = None
    commitments: Dict[str, str] = field(default_factory=dict)
    reveals: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    lineage: List[str] = field(default_factory=list)

    def is_overdue(self, now: Optional[datetime] = None) -> bool:
        reference = now or datetime.now(timezone.utc)
        return reference > self.deadline

    def record_commitment(self, validator: str, verdict: str, salt: str) -> None:
        payload = f"{self.job_id}:{verdict}:{salt}".encode("utf-8")
        self.commitments[validator] = hashlib.sha256(payload).hexdigest()

    def reveal(self, validator: str, verdict: str, salt: str) -> bool:
        payload = f"{self.job_id}:{verdict}:{salt}".encode("utf-8")
        expected = hashlib.sha256(payload).hexdigest()
        committed = self.commitments.get(validator)
        if committed != expected:
            return False
        self.reveals[validator] = {"verdict": verdict, "salt": salt, "timestamp": time.time()}
        return True

    def child(self, spec: Dict[str, Any], owner: str, deadline_hours: float) -> "Job":
        child_job = Job(
            title=spec.get("title", f"Subtask of {self.title}"),
            reward=float(spec.get("reward", self.reward * 0.1)),
            deadline=datetime.now(timezone.utc) + timedelta(hours=deadline_hours),
            energy_budget=float(spec.get("energy_budget", self.energy_budget / 2)),
            compute_budget=float(spec.get("compute_budget", self.compute_budget / 2)),
            description=str(spec.get("description", "")),
            skills=list(spec.get("skills", [])),
            owner=owner,
        )
        child_job.parent_id = self.job_id
        child_job.lineage = self.lineage + [self.job_id]
        return child_job


class JobRegistry:
    def __init__(self) -> None:
        self._jobs: Dict[str, Job] = {}
        self._children: Dict[str, List[str]] = {}

    def add_job(self, job: Job) -> None:
        self._jobs[job.job_id] = job
        if job.parent_id:
            self._children.setdefault(job.parent_id, []).append(job.job_id)
        self._children.setdefault(job.job_id, [])

    def get(self, job_id: str) -> Job:
        return self._jobs[job_id]

    def jobs(self) -> List[Job]:
        return list(self._jobs.values())

    def active_jobs(self) -> List[Job]:
        return [job for job in self._jobs.values() if job.status in {JobStatus.PENDING, JobStatus.ACTIVE, JobStatus.VALIDATING}]

    def child_ids(self, job_id: str) -> List[str]:
        return list(self._children.get(job_id, []))

    def graph(self) -> Dict[str, List[str]]:
        return {job_id: list(children) for job_id, children in self._children.items()}

    def terminal_jobs(self) -> List[Job]:
        return [job for job in self._jobs.values() if not self.child_ids(job.job_id)]

    def mark_status(self, job_id: str, status: JobStatus) -> None:
        job = self._jobs[job_id]
        job.status = status

    def assign(self, job_id: str, agent: str) -> None:
        job = self._jobs[job_id]
        job.assigned_agent = agent
        job.status = JobStatus.ACTIVE

    def to_dict(self) -> Dict[str, Any]:
        return {
            job_id: {
                "title": job.title,
                "reward": job.reward,
                "deadline": job.deadline.isoformat(),
                "energy_budget": job.energy_budget,
                "compute_budget": job.compute_budget,
                "description": job.description,
                "skills": job.skills,
                "owner": job.owner,
                "job_id": job.job_id,
                "parent_id": job.parent_id,
                "status": job.status.value,
                "assigned_agent": job.assigned_agent,
                "energy_used": job.energy_used,
                "compute_used": job.compute_used,
                "created_at": job.created_at.isoformat(),
                "result": job.result,
                "commitments": job.commitments,
                "reveals": job.reveals,
                "lineage": job.lineage,
                "children": self.child_ids(job.job_id),
            }
            for job_id, job in self._jobs.items()
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "JobRegistry":
        registry = cls()
        for job_id, payload in data.items():
            job = Job(
                title=payload["title"],
                reward=float(payload["reward"]),
                deadline=datetime.fromisoformat(payload["deadline"]),
                energy_budget=float(payload["energy_budget"]),
                compute_budget=float(payload["compute_budget"]),
                description=payload["description"],
                skills=list(payload.get("skills", [])),
                owner=payload["owner"],
                job_id=payload["job_id"],
            )
            job.parent_id = payload.get("parent_id")
            job.status = JobStatus(payload["status"])
            job.assigned_agent = payload.get("assigned_agent")
            job.energy_used = float(payload.get("energy_used", 0.0))
            job.compute_used = float(payload.get("compute_used", 0.0))
            job.created_at = datetime.fromisoformat(payload["created_at"])
            job.result = payload.get("result")
            job.commitments = dict(payload.get("commitments", {}))
            job.reveals = dict(payload.get("reveals", {}))
            job.lineage = list(payload.get("lineage", []))
            registry.add_job(job)
        return registry

    def pending_children(self, job_id: str) -> List[Job]:
        return [self._jobs[cid] for cid in self.child_ids(job_id) if self._jobs[cid].status != JobStatus.COMPLETED]

    def completed(self, job_id: str) -> bool:
        return self._jobs[job_id].status == JobStatus.COMPLETED

    def outstanding_dependencies(self, job_id: str) -> bool:
        return any(child.status != JobStatus.COMPLETED for child in (self._jobs[cid] for cid in self.child_ids(job_id)))
