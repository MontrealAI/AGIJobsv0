"""Core data structures used by the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum, auto
from hashlib import sha256
from typing import TYPE_CHECKING, Dict, List, Optional, Tuple

if TYPE_CHECKING:  # pragma: no cover - only for typing purposes
    from .governance import TimelockedAction


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
class RewardSummary:
    """Aggregated reward telemetry across an entire demo run."""

    total_reward: float
    architect_total: float
    solver_totals: Dict[str, float]
    validator_totals: Dict[str, float]
    top_solver: Optional[str] = None
    top_validator: Optional[str] = None

    def to_dict(self) -> Dict[str, object]:
        return {
            "total_reward": self.total_reward,
            "architect_total": self.architect_total,
            "solver_totals": dict(self.solver_totals),
            "validator_totals": dict(self.validator_totals),
            "top_solver": self.top_solver,
            "top_validator": self.top_validator,
        }


@dataclass
class OpportunitySynopsis:
    """High-level opportunity surfaced to the platform owner."""

    name: str
    impact_score: float
    confidence: float
    narrative: str
    energy_ratio: float
    capital_allocation: float

    def to_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "impact_score": self.impact_score,
            "confidence": self.confidence,
            "narrative": self.narrative,
            "energy_ratio": self.energy_ratio,
            "capital_allocation": self.capital_allocation,
        }


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
class VerificationDigest:
    """Aggregates cross-checks validating the evolved program."""

    primary_score: float
    holdout_scores: Dict[str, float]
    residual_mean: float
    residual_std: float
    divergence: float
    pass_holdout: bool
    pass_residual_balance: bool
    pass_divergence: bool
    mae_score: float
    pass_mae: bool
    bootstrap_interval: Tuple[float, float]
    pass_confidence: bool
    monotonic_pass: bool
    monotonic_violations: int
    stress_scores: Dict[str, float]
    pass_stress: bool
    stress_threshold: float
    entropy_score: float
    pass_entropy: bool
    entropy_floor: float
    precision_replay_score: float
    pass_precision_replay: bool
    variance_ratio: float
    pass_variance_ratio: bool
    spectral_ratio: float
    pass_spectral_ratio: bool

    @property
    def overall_pass(self) -> bool:
        return (
            self.pass_holdout
            and self.pass_residual_balance
            and self.pass_divergence
            and self.pass_mae
            and self.pass_confidence
            and self.monotonic_pass
            and self.pass_stress
            and self.pass_entropy
            and self.pass_precision_replay
            and self.pass_variance_ratio
            and self.pass_spectral_ratio
        )

    def to_dict(self) -> Dict[str, object]:
        return {
            "primary_score": self.primary_score,
            "holdout_scores": dict(self.holdout_scores),
            "residual_mean": self.residual_mean,
            "residual_std": self.residual_std,
            "divergence": self.divergence,
            "pass_holdout": self.pass_holdout,
            "pass_residual_balance": self.pass_residual_balance,
            "pass_divergence": self.pass_divergence,
            "mae_score": self.mae_score,
            "pass_mae": self.pass_mae,
            "bootstrap_interval": list(self.bootstrap_interval),
            "pass_confidence": self.pass_confidence,
            "monotonic_pass": self.monotonic_pass,
            "monotonic_violations": self.monotonic_violations,
            "stress_scores": dict(self.stress_scores),
            "pass_stress": self.pass_stress,
            "stress_threshold": self.stress_threshold,
            "entropy_score": self.entropy_score,
            "pass_entropy": self.pass_entropy,
            "entropy_floor": self.entropy_floor,
            "precision_replay_score": self.precision_replay_score,
            "pass_precision_replay": self.pass_precision_replay,
            "variance_ratio": self.variance_ratio,
            "pass_variance_ratio": self.pass_variance_ratio,
            "spectral_ratio": self.spectral_ratio,
            "pass_spectral_ratio": self.pass_spectral_ratio,
            "overall_pass": self.overall_pass,
        }


@dataclass
class DemoRunArtifacts:
    """Aggregated trace produced at the end of a simulation."""

    scenario: str
    jobs: List[Job]
    performances: List[AgentPerformance]
    rewards: List[RewardBreakdown]
    reward_summary: RewardSummary
    evolution: List[EvolutionRecord]
    final_program: str
    final_score: float
    verification: VerificationDigest
    owner_actions: List[OwnerAction]
    timelock_actions: List["TimelockedAction"]
    opportunities: List[OpportunitySynopsis]
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
            "reward_summary": self.reward_summary.to_dict(),
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
            "verification": self.verification.to_dict(),
            "owner_actions": [action.to_dict() for action in self.owner_actions],
            "timelock_actions": [action.to_dict() for action in self.timelock_actions],
            "opportunities": [opportunity.to_dict() for opportunity in self.opportunities],
            "improvement_over_first": self.improvement_over_first,
            "first_success_generation": self.first_success_generation,
            "generated_at": self.generated_at.isoformat(),
        }
