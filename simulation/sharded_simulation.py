"""High level sharded workload simulator.

This module is intentionally self contained so that CI jobs and local demo
scripts can import it without pulling in the rest of the project runtime.  The
core entry point is :func:`run_sharded_simulation` which generates a batch of
jobs (10k by default) and pushes them through a configurable sharded execution
model.  The simulation models three real-world concerns:

* per-shard workload balancing with configurable mixes of job profiles
* node failure injection and tracking of the effective failure rate
* orchestrator kill/restart cycles with checkpointing semantics

The returned :class:`SimulationResult` structure exposes rich telemetry that is
consumed by the reporting helpers in :mod:`simulation.simulation_reports`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional
import math
import random


@dataclass(frozen=True)
class WorkloadProfile:
    """Describe the statistical behaviour of a workload profile."""

    name: str
    success_probability: float
    runtime_mean: float
    runtime_stddev: float

    def sample_runtime(self, rng: random.Random) -> int:
        """Sample a runtime in ticks, enforcing a lower bound of one tick."""

        duration = rng.gauss(self.runtime_mean, self.runtime_stddev)
        return max(1, int(round(duration)))


@dataclass(frozen=True)
class SimulationConfig:
    """Configuration object driving a sharded simulation run."""

    total_jobs: int = 10_000
    shard_count: int = 8
    workloads: Dict[str, WorkloadProfile] = field(default_factory=dict)
    workload_mix: Dict[str, float] = field(default_factory=dict)
    jobs_per_tick: int = 250
    failure_injection_chance: float = 0.01
    failure_recovery_ticks: int = 4
    orchestrator_kill_tick: int = 40
    orchestrator_downtime_ticks: int = 5
    random_seed: Optional[int] = 1337

    def __post_init__(self) -> None:
        if self.total_jobs <= 0:
            raise ValueError("total_jobs must be positive")
        if self.shard_count <= 0:
            raise ValueError("shard_count must be positive")
        if not self.workloads:
            raise ValueError("workloads must not be empty")
        if not self.workload_mix:
            raise ValueError("workload_mix must not be empty")
        for workload_name in self.workload_mix:
            if workload_name not in self.workloads:
                raise ValueError(f"Unknown workload '{workload_name}' in mix")
        if self.failure_injection_chance < 0 or self.failure_injection_chance > 1:
            raise ValueError("failure_injection_chance must be within [0, 1]")
        if self.failure_recovery_ticks < 0:
            raise ValueError("failure_recovery_ticks must be >= 0")
        if self.orchestrator_downtime_ticks < 0:
            raise ValueError("orchestrator_downtime_ticks must be >= 0")


@dataclass
class JobRecord:
    """Telemetry for an individual simulated job."""

    job_id: int
    shard_id: int
    workload: str
    assigned_tick: int
    completion_tick: int
    success: bool
    failure_reason: Optional[str]


@dataclass
class OrchestratorMetrics:
    """Observability for the orchestrator kill/restart window."""

    kill_tick: int
    restart_tick: int
    jobs_completed_before_kill: int
    jobs_completed_after_restart: int
    downtime_ticks: int


@dataclass
class SimulationResult:
    """Container for simulation artefacts and summary metrics."""

    config: SimulationConfig
    job_records: List[JobRecord]
    orchestrator_metrics: OrchestratorMetrics

    @property
    def total_jobs(self) -> int:
        return len(self.job_records)

    @property
    def failed_jobs(self) -> int:
        return sum(1 for record in self.job_records if not record.success)

    @property
    def failure_rate(self) -> float:
        if not self.job_records:
            return 0.0
        return self.failed_jobs / len(self.job_records)

    def assert_failure_rate(self, threshold: float = 0.02) -> None:
        """Raise an error if the observed failure rate is above ``threshold``."""

        if self.failure_rate > threshold:
            raise RuntimeError(
                f"Observed failure rate {self.failure_rate:.4%} exceeds threshold {threshold:.2%}"
            )


@dataclass
class _ShardState:
    """Internal helper state for each shard."""

    shard_id: int
    available_at: int = 0


def _expand_job_queue(config: SimulationConfig) -> List[str]:
    """Expand the workload mix into a concrete ordered job queue."""

    weights = config.workload_mix
    total_weight = sum(weights.values())
    if total_weight <= 0:
        raise ValueError("workload_mix weights must sum to a positive value")

    # Determine integer counts per workload while preserving total job count.
    counts: Dict[str, int] = {}
    running_total = 0
    for workload, weight in weights.items():
        ratio = weight / total_weight
        count = int(math.floor(config.total_jobs * ratio))
        counts[workload] = count
        running_total += count

    # Distribute any remainder starting from the heaviest workloads for stability.
    remainder = config.total_jobs - running_total
    if remainder > 0:
        sorted_workloads = sorted(weights.items(), key=lambda item: item[1], reverse=True)
        for workload, _ in sorted_workloads[:remainder]:
            counts[workload] += 1

    queue: List[str] = []
    for workload, count in counts.items():
        queue.extend([workload] * count)

    return queue


def run_sharded_simulation(config: SimulationConfig) -> SimulationResult:
    """Execute a sharded workload simulation using ``config``."""

    rng = random.Random(config.random_seed)
    job_queue = _expand_job_queue(config)
    if len(job_queue) != config.total_jobs:
        raise AssertionError("Job queue generation mismatch")

    shard_states = [_ShardState(shard_id=i) for i in range(config.shard_count)]
    pending_jobs: List[str] = job_queue.copy()
    job_records: List[JobRecord] = []
    next_job_id = 0
    tick = 0

    orchestrator_down_from = config.orchestrator_kill_tick
    orchestrator_down_until = orchestrator_down_from + config.orchestrator_downtime_ticks
    jobs_completed_before_kill = 0
    jobs_completed_after_restart = 0

    # Maintain rolling counts for before/after metrics using completion tick.
    def _update_checkpoint_metrics(record: JobRecord) -> None:
        nonlocal jobs_completed_before_kill, jobs_completed_after_restart
        if record.completion_tick < orchestrator_down_from:
            jobs_completed_before_kill += 1
        elif record.completion_tick >= orchestrator_down_until:
            jobs_completed_after_restart += 1

    # While loop ends once every job is processed.
    while next_job_id < config.total_jobs:
        if orchestrator_down_from <= tick < orchestrator_down_until:
            tick += 1
            continue

        jobs_assigned_this_tick = 0
        shard_index_cycle = list(range(config.shard_count))
        for shard_idx in shard_index_cycle:
            if jobs_assigned_this_tick >= config.jobs_per_tick:
                break
            if not pending_jobs:
                break

            shard_state = shard_states[shard_idx]
            if shard_state.available_at > tick:
                continue

            workload_name = pending_jobs.pop(0)
            profile = config.workloads[workload_name]
            assigned_tick = tick
            shard_state.available_at = tick  # ensure consistent baseline

            failure_reason: Optional[str] = None
            success = True

            node_failure = rng.random() < config.failure_injection_chance
            if node_failure:
                success = False
                failure_reason = "node_failure"
                shard_state.available_at = tick + config.failure_recovery_ticks
                completion_tick = shard_state.available_at
            else:
                run_time = profile.sample_runtime(rng)
                completion_tick = tick + run_time
                shard_state.available_at = completion_tick
                workload_success = rng.random() < profile.success_probability
                if not workload_success:
                    success = False
                    failure_reason = "workload_failure"

            record = JobRecord(
                job_id=next_job_id,
                shard_id=shard_state.shard_id,
                workload=workload_name,
                assigned_tick=assigned_tick,
                completion_tick=completion_tick,
                success=success,
                failure_reason=failure_reason,
            )
            job_records.append(record)
            _update_checkpoint_metrics(record)

            next_job_id += 1
            jobs_assigned_this_tick += 1

            if next_job_id >= config.total_jobs:
                break

        tick += 1

    orchestrator_metrics = OrchestratorMetrics(
        kill_tick=orchestrator_down_from,
        restart_tick=orchestrator_down_until,
        jobs_completed_before_kill=jobs_completed_before_kill,
        jobs_completed_after_restart=jobs_completed_after_restart,
        downtime_ticks=config.orchestrator_downtime_ticks,
    )

    result = SimulationResult(
        config=config,
        job_records=job_records,
        orchestrator_metrics=orchestrator_metrics,
    )

    result.assert_failure_rate()
    return result


def default_config(total_jobs: int = 10_000, shard_count: int = 8) -> SimulationConfig:
    """Return a :class:`SimulationConfig` with opinionated defaults."""

    workloads = {
        "baseline": WorkloadProfile(
            name="baseline", success_probability=0.995, runtime_mean=3, runtime_stddev=1
        ),
        "ai_inference": WorkloadProfile(
            name="ai_inference",
            success_probability=0.992,
            runtime_mean=6,
            runtime_stddev=2,
        ),
        "data_pipeline": WorkloadProfile(
            name="data_pipeline",
            success_probability=0.998,
            runtime_mean=5,
            runtime_stddev=2,
        ),
    }

    workload_mix = {
        "baseline": 0.5,
        "ai_inference": 0.3,
        "data_pipeline": 0.2,
    }

    return SimulationConfig(
        total_jobs=total_jobs,
        shard_count=shard_count,
        workloads=workloads,
        workload_mix=workload_mix,
    )


__all__ = [
    "WorkloadProfile",
    "SimulationConfig",
    "JobRecord",
    "OrchestratorMetrics",
    "SimulationResult",
    "run_sharded_simulation",
    "default_config",
]

