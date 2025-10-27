"""Reporting helpers for the sharded workload simulator."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Iterable, List

try:  # pragma: no cover - optional dependency for richer visuals.
    import matplotlib.pyplot as plt  # type: ignore
except Exception:  # pragma: no cover - keep running without matplotlib.
    plt = None

from .sharded_simulation import JobRecord, SimulationResult


def _write_jobs_csv(records: Iterable[JobRecord], path: Path) -> None:
    field_names = [
        "job_id",
        "shard_id",
        "workload",
        "assigned_tick",
        "completion_tick",
        "success",
        "failure_reason",
    ]
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=field_names)
        writer.writeheader()
        for record in records:
            writer.writerow(
                {
                    "job_id": record.job_id,
                    "shard_id": record.shard_id,
                    "workload": record.workload,
                    "assigned_tick": record.assigned_tick,
                    "completion_tick": record.completion_tick,
                    "success": record.success,
                    "failure_reason": record.failure_reason or "",
                }
            )


def _write_summary_json(result: SimulationResult, path: Path) -> None:
    shard_breakdown = defaultdict(lambda: {"success": 0, "failure": 0})
    for record in result.job_records:
        key = "success" if record.success else "failure"
        shard_breakdown[record.shard_id][key] += 1

    summary = {
        "config": {
            "total_jobs": result.config.total_jobs,
            "shard_count": result.config.shard_count,
            "jobs_per_tick": result.config.jobs_per_tick,
            "failure_injection_chance": result.config.failure_injection_chance,
            "failure_recovery_ticks": result.config.failure_recovery_ticks,
            "orchestrator_kill_tick": result.config.orchestrator_kill_tick,
            "orchestrator_downtime_ticks": result.config.orchestrator_downtime_ticks,
        },
        "failures": {
            "total": result.failed_jobs,
            "rate": result.failure_rate,
        },
        "orchestrator": {
            "kill_tick": result.orchestrator_metrics.kill_tick,
            "restart_tick": result.orchestrator_metrics.restart_tick,
            "downtime_ticks": result.orchestrator_metrics.downtime_ticks,
            "jobs_completed_before_kill": result.orchestrator_metrics.jobs_completed_before_kill,
            "jobs_completed_after_restart": result.orchestrator_metrics.jobs_completed_after_restart,
        },
        "shards": {
            str(shard_id): breakdown for shard_id, breakdown in shard_breakdown.items()
        },
    }

    path.write_text(json.dumps(summary, indent=2))


def _plot_throughput(result: SimulationResult, path: Path) -> None:
    if plt is None:
        # Provide a friendly placeholder so CI artefacts remain informative.
        path.write_text(
            "matplotlib not available; install matplotlib to generate throughput plots"
        )
        return

    completion_series: List[int] = []
    ticks: List[int] = []
    completed = 0
    for record in sorted(result.job_records, key=lambda item: item.completion_tick):
        completed += 1
        completion_series.append(completed)
        ticks.append(record.completion_tick)

    plt.figure(figsize=(10, 6))
    plt.step(ticks, completion_series, where="post")
    plt.title("Shard throughput over time")
    plt.xlabel("Tick")
    plt.ylabel("Completed jobs")
    plt.grid(True, linestyle="--", alpha=0.5)
    plt.tight_layout()
    plt.savefig(path)
    plt.close()


def export_reports(result: SimulationResult, output_dir: Path) -> None:
    """Persist structured and human friendly artefacts for demo/CI usage."""

    output_dir.mkdir(parents=True, exist_ok=True)
    _write_jobs_csv(result.job_records, output_dir / "jobs.csv")
    _write_summary_json(result, output_dir / "summary_detailed.json")
    _plot_throughput(result, output_dir / "throughput.png")

