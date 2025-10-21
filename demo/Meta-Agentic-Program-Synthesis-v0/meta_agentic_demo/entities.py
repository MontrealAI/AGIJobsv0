"""Core data structures used by the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum, auto
from hashlib import sha256
from typing import Dict, List, Optional


class JobStatus(Enum):
    """Lifecycle stages for a simulated AGI Jobs listing."""

    OPEN = auto()
    IN_PROGRESS = auto()
    COMPLETED = auto()
    FAILED = auto()


@dataclass
class Job:
    """Represents a unit of autonomous work posted to the marketplace."""

    job_id: int
    title: str
    description: str
    reward: float
    stake_required: float
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    status: JobStatus = JobStatus.OPEN
    assigned_node: Optional[str] = None
    result_commit: Optional[str] = None
    result_payload: Optional[Dict[str, float]] = None
    energy_spent: Optional[float] = None

    def commit_result(self, payload: Dict[str, float]) -> str:
        """Persist a cryptographic commitment to the node's output."""

        self.result_payload = payload
        digest = sha256(repr(sorted(payload.items())).encode("utf-8")).hexdigest()
        self.result_commit = digest
        self.status = JobStatus.IN_PROGRESS
        return digest

    def reveal_result(self, digest: str) -> Dict[str, float]:
        if self.result_commit != digest:
            raise ValueError("Reveal digest does not match commitment")
        if self.result_payload is None:
            raise ValueError("No payload captured for reveal")
        self.status = JobStatus.COMPLETED
        return self.result_payload

    def to_dict(self) -> Dict[str, object]:
        return {
            "job_id": self.job_id,
            "title": self.title,
            "description": self.description,
            "reward": self.reward,
            "stake_required": self.stake_required,
            "created_at": self.created_at.isoformat(),
            "status": self.status.name,
            "assigned_node": self.assigned_node,
            "result_commit": self.result_commit,
            "result_payload": self.result_payload,
            "energy_spent": self.energy_spent,
        }


@dataclass
class AgentPerformance:
    """Stores telemetry for a solver or validator."""

    address: str
    energy: float
    score: float
    stake_before: float
    stake_after: float


@dataclass
class RewardBreakdown:
    """Token distribution outcome for a single job."""

    job_id: int
    total_reward: float
    solver_rewards: Dict[str, float]
    validator_rewards: Dict[str, float]
    architect_reward: float
    solver_energy: Dict[str, float]
    validator_energy: Dict[str, float]


@dataclass
class OwnerAction:
    """Structured record of privileged actions taken by the platform owner."""

    timestamp: datetime
    action: str
    payload: Dict[str, object]

    def to_dict(self) -> Dict[str, object]:
        return {
            "timestamp": self.timestamp.isoformat(),
            "action": self.action,
            "payload": self.payload,
        }


@dataclass
class EvolutionRecord:
    """Captures the outcome of a generation in the synthesis loop."""

    generation: int
    best_score: float
    average_score: float
    score_variance: float
    best_score_delta: float | None
    winning_program: str
    notes: str


@dataclass
class DemoRunArtifacts:
    """Aggregated trace produced at the end of a simulation."""

    scenario: str
    jobs: List[Job]
    performances: List[AgentPerformance]
    rewards: List[RewardBreakdown]
    evolution: List[EvolutionRecord]
    final_program: str
    final_score: float
    owner_actions: List[OwnerAction]
    improvement_over_first: float
    first_success_generation: int | None
    generated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> Dict[str, object]:
        return {
            "scenario": self.scenario,
            "jobs": [job.to_dict() for job in self.jobs],
            "performances": [perf.__dict__ for perf in self.performances],
            "rewards": [
                {
                    "job_id": breakdown.job_id,
                    "total_reward": breakdown.total_reward,
                    "solver_rewards": breakdown.solver_rewards,
                    "validator_rewards": breakdown.validator_rewards,
                    "architect_reward": breakdown.architect_reward,
                    "solver_energy": breakdown.solver_energy,
                    "validator_energy": breakdown.validator_energy,
                }
                for breakdown in self.rewards
            ],
            "evolution": [
                {
                    "generation": record.generation,
                    "best_score": record.best_score,
                    "average_score": record.average_score,
                    "score_variance": record.score_variance,
                    "best_score_delta": record.best_score_delta,
                    "winning_program": record.winning_program,
                    "notes": record.notes,
                }
                for record in self.evolution
            ],
            "final_program": self.final_program,
            "final_score": self.final_score,
            "owner_actions": [action.to_dict() for action in self.owner_actions],
            "improvement_over_first": self.improvement_over_first,
            "first_success_generation": self.first_success_generation,
            "generated_at": self.generated_at.isoformat(),
        }
