"""Command line entry point for the sharded workload simulator."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict

from .sharded_simulation import SimulationConfig, WorkloadProfile, default_config, run_sharded_simulation
from .simulation_reports import export_reports


def _parse_workload_mix(value: str) -> Dict[str, float]:
    """Parse ``name=weight`` comma separated pairs into a workload mix."""

    mix: Dict[str, float] = {}
    for item in value.split(","):
        if not item:
            continue
        name, _, weight_str = item.partition("=")
        if not name or not weight_str:
            raise argparse.ArgumentTypeError(
                "Workload mix items must follow the 'name=weight' format"
            )
        try:
            mix[name] = float(weight_str)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(
                f"Invalid weight '{weight_str}' for workload '{name}'"
            ) from exc
    if not mix:
        raise argparse.ArgumentTypeError("At least one workload mix entry is required")
    return mix


def build_config_from_args(args: argparse.Namespace) -> SimulationConfig:
    if args.use_defaults:
        config = default_config(total_jobs=args.total_jobs, shard_count=args.shard_count)
        if args.failure_injection_chance is not None:
            config = SimulationConfig(
                total_jobs=config.total_jobs,
                shard_count=config.shard_count,
                workloads=config.workloads,
                workload_mix=config.workload_mix,
                jobs_per_tick=config.jobs_per_tick,
                failure_injection_chance=args.failure_injection_chance,
                failure_recovery_ticks=config.failure_recovery_ticks,
                orchestrator_kill_tick=args.orchestrator_kill_tick,
                orchestrator_downtime_ticks=args.orchestrator_downtime,
                random_seed=args.seed,
            )
        else:
            config = SimulationConfig(
                total_jobs=config.total_jobs,
                shard_count=config.shard_count,
                workloads=config.workloads,
                workload_mix=config.workload_mix,
                jobs_per_tick=config.jobs_per_tick,
                failure_injection_chance=config.failure_injection_chance,
                failure_recovery_ticks=config.failure_recovery_ticks,
                orchestrator_kill_tick=args.orchestrator_kill_tick,
                orchestrator_downtime_ticks=args.orchestrator_downtime,
                random_seed=args.seed,
            )
        return config

    workloads = {}
    for item in args.workload:
        name, _, payload = item.partition(":")
        if not name or not payload:
            raise argparse.ArgumentTypeError(
                "Workloads must be passed as name:success_probability,runtime_mean,runtime_std"
            )
        try:
            success_str, runtime_mean_str, runtime_std_str = payload.split(",")
        except ValueError as exc:
            raise argparse.ArgumentTypeError(
                f"Workload '{item}' must contain exactly three comma separated values"
            ) from exc
        workloads[name] = WorkloadProfile(
            name=name,
            success_probability=float(success_str),
            runtime_mean=float(runtime_mean_str),
            runtime_stddev=float(runtime_std_str),
        )

    if not workloads:
        raise argparse.ArgumentTypeError(
            "At least one --workload definition is required when --use-defaults is false"
        )

    mix = _parse_workload_mix(args.workload_mix)

    return SimulationConfig(
        total_jobs=args.total_jobs,
        shard_count=args.shard_count,
        workloads=workloads,
        workload_mix=mix,
        jobs_per_tick=args.jobs_per_tick,
        failure_injection_chance=args.failure_injection_chance,
        failure_recovery_ticks=args.failure_recovery_ticks,
        orchestrator_kill_tick=args.orchestrator_kill_tick,
        orchestrator_downtime_ticks=args.orchestrator_downtime,
        random_seed=args.seed,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--total-jobs", type=int, default=10_000)
    parser.add_argument("--shard-count", type=int, default=8)
    parser.add_argument("--jobs-per-tick", type=int, default=250)
    parser.add_argument("--failure-injection-chance", type=float, default=0.01)
    parser.add_argument("--failure-recovery-ticks", type=int, default=4)
    parser.add_argument("--orchestrator-kill-tick", type=int, default=40)
    parser.add_argument("--orchestrator-downtime", type=int, default=5)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument(
        "--use-defaults",
        action="store_true",
        help="Use the opinionated defaults shipped with the project."
        " Additional workload definitions are ignored in this mode.",
    )
    parser.add_argument(
        "--workload",
        action="append",
        default=[],
        help=(
            "Custom workload definition in the form"
            " name:success_probability,runtime_mean,runtime_stddev"
        ),
    )
    parser.add_argument(
        "--workload-mix",
        default="baseline=0.5,ai_inference=0.3,data_pipeline=0.2",
        help="Comma separated workload mix, expressed as name=weight entries.",
    )
    parser.add_argument(
        "--output",
        default="simulation_output",
        help="Directory where raw telemetry and visualisations are written.",
    )

    args = parser.parse_args()
    config = build_config_from_args(args)

    result = run_sharded_simulation(config)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    export_reports(result, output_dir)

    summary = {
        "total_jobs": result.total_jobs,
        "failed_jobs": result.failed_jobs,
        "failure_rate": result.failure_rate,
        "orchestrator": {
            "kill_tick": result.orchestrator_metrics.kill_tick,
            "restart_tick": result.orchestrator_metrics.restart_tick,
            "jobs_completed_before_kill": result.orchestrator_metrics.jobs_completed_before_kill,
            "jobs_completed_after_restart": result.orchestrator_metrics.jobs_completed_after_restart,
        },
    }

    summary_path = output_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

