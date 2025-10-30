"""Command-line interface for the AlphaEvolve demo."""
from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from .controller import AlphaEvolveController, ControllerConfig
from .evaluation import MarketSimulation, SimulationConfig
from .heuristics import AgentProfile, JobListing


def load_baseline_code() -> str:
    heuristics_path = Path(__file__).with_name("heuristics.py")
    return heuristics_path.read_text()


def create_default_agents() -> list[AgentProfile]:
    return [
        AgentProfile("agent-1", reputation=0.82, stake=0.75, cost_per_job=82, specialization={"ai", "ml"}, region="NA"),
        AgentProfile("agent-2", reputation=0.55, stake=0.35, cost_per_job=36, specialization={"ml", "cv"}, region="EU"),
        AgentProfile("agent-3", reputation=0.62, stake=0.48, cost_per_job=30, specialization={"nlp", "ai"}, region="APAC"),
        AgentProfile("agent-4", reputation=0.45, stake=0.25, cost_per_job=28, specialization={"ops", "cv"}, region="NA"),
        AgentProfile("agent-5", reputation=0.76, stake=0.68, cost_per_job=34, specialization={"ai", "ops"}, region="EU"),
    ]


def create_default_jobs() -> list[JobListing]:
    return [
        JobListing("job-1", value=220, urgency=0.8, required_skills={"ai"}, region="NA", max_cost=120),
        JobListing("job-2", value=180, urgency=0.6, required_skills={"ml", "cv"}, region="EU", max_cost=100),
        JobListing("job-3", value=210, urgency=0.4, required_skills={"nlp"}, region="APAC", max_cost=110),
        JobListing("job-4", value=230, urgency=0.7, required_skills={"ops", "ai"}, region="NA", max_cost=130),
        JobListing("job-5", value=190, urgency=0.5, required_skills={"ops"}, region="EU", max_cost=95),
    ]


def run_demo(generations: int, manifest: Path) -> None:
    baseline_code = load_baseline_code()
    agents = create_default_agents()
    jobs = create_default_jobs()
    controller = AlphaEvolveController(
        baseline_code,
        agents,
        jobs,
        ControllerConfig(max_generations=generations, baseline_metrics={}),
        manifest,
    )
    asyncio.run(controller.run())
    print(controller.telemetry.render_report())


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="AlphaEvolve Demo Controller")
    parser.add_argument("--generations", type=int, default=3, help="Number of generations to simulate")
    parser.add_argument(
        "--manifest", type=Path, default=Path(__file__).resolve().parents[1] / "alphaevolve_manifest.json",
        help="Path to manifest JSON",
    )
    args = parser.parse_args(argv)
    run_demo(args.generations, args.manifest)


if __name__ == "__main__":
    main()

