from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Sequence

from alphaevolve.config import AlphaEvolveConfig, load_config
from alphaevolve.controller import AlphaEvolveController
from alphaevolve.evaluator import EvaluationHarness
from alphaevolve.heuristics import Agent, Job
from alphaevolve.metrics import MetricsRegistry
from alphaevolve.program_db import ProgramAtlas, ProgramRecord


def _bootstrap_population(atlas: ProgramAtlas, baseline_metrics) -> None:
    atlas.add(
        ProgramRecord(
            generation=0,
            code="baseline",
            metrics=baseline_metrics,
            diff_metadata={"model": "baseline"},
            is_champion=True,
        )
    )


def _generate_agents(count: int = 12) -> Sequence[Agent]:
    agents = []
    for idx in range(count):
        agents.append(
            Agent(
                id=f"agent-{idx}",
                reputation=0.5 + idx * 0.03,
                stake=0.2 + idx * 0.02,
                cost=0.5 + idx * 0.05,
                speed=1.0 + idx * 0.1,
                speciality="ml" if idx % 2 == 0 else "web",
            )
        )
    return agents


def _generate_jobs(count: int = 15) -> Sequence[Job]:
    jobs = []
    for idx in range(count):
        jobs.append(
            Job(
                id=f"job-{idx}",
                reward=100 + idx * 5,
                difficulty=0.3 + (idx % 5) * 0.1,
                urgency=0.4 + (idx % 3) * 0.2,
                speciality="ml" if idx % 2 == 0 else "web",
            )
        )
    return jobs


def run_demo(args: argparse.Namespace) -> None:
    config_path = Path(args.config) if args.config else None
    config = load_config(config_path)
    harness = EvaluationHarness(config.baseline_metrics)
    atlas = ProgramAtlas(primary_metric="Utility")
    registry = MetricsRegistry()
    _bootstrap_population(atlas, config.baseline_metrics)
    controller = AlphaEvolveController(config, harness, atlas, registry)
    controller.seed(args.seed)

    agents = _generate_agents()
    jobs = _generate_jobs()

    async def _loop():
        reports = []
        for generation in range(1, args.generations + 1):
            report = await controller.run_generation(generation, agents=agents, jobs=jobs)
            reports.append(report)
            status = "ACCEPTED" if report.accepted else "REJECTED"
            print(
                f"gen={generation:03d} status={status:<9} utility={report.metrics['Utility']:.2f} "
                f"cost={report.metrics['Cost']:.2f} fairness={report.metrics['Fairness']:.3f} "
                f"latency={report.metrics['Latency']:.3f}s guardrail={report.guardrail.ok} time={report.elapsed:.3f}s"
            )
        return reports

    reports = asyncio.run(_loop())
    output = {
        "baseline": config.baseline_metrics,
        "final": reports[-1].metrics if reports else config.baseline_metrics,
        "champion": atlas.champion.metrics if atlas.champion else {},
        "telemetry": registry.snapshot(),
        "history": [
            {
                "generation": r.generation,
                "accepted": r.accepted,
                "metrics": r.metrics,
                "guardrail": {"ok": r.guardrail.ok, "message": r.guardrail.message},
            }
            for r in reports
        ],
    }
    Path(args.output).write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"\nDay-one uplift report saved to {args.output}")
    if atlas.champion:
        uplift = atlas.champion.metrics["Utility"] / config.baseline_metrics["Utility"] - 1
        print(f"Champion utility uplift: {uplift:.2%}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AlphaEvolve grand demo")
    sub = parser.add_subparsers(dest="command")
    run_cmd = sub.add_parser("run", help="execute the self-evolution loop")
    run_cmd.add_argument("--generations", type=int, default=30)
    run_cmd.add_argument("--seed", type=int, default=7)
    run_cmd.add_argument("--config", type=str, default=None)
    run_cmd.add_argument("--output", type=str, default="alphaevolve_report.json")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.command != "run":
        parser.print_help()
        return
    run_demo(args)


if __name__ == "__main__":
    main()
