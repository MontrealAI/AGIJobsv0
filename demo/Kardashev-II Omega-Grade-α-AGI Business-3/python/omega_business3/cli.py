from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from typing import Optional

from .config import load_config
from .job import JobStatus
from .orchestrator import OmegaOrchestrator


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Kardashev-II Omega-Grade α-AGI Business Orchestrator")
    parser.add_argument("command", choices=["run", "pause", "resume", "status"], help="Command to execute")
    parser.add_argument("--config", default="config/default_config.json", help="Path to configuration file")
    parser.add_argument("--cycles", type=int, default=0, help="Number of cycles to execute (0 for continuous)")
    parser.add_argument("--base-path", default=str(Path(__file__).resolve().parents[2]), help="Base path for relative assets")
    return parser


def resolve_base_path(base_path: str | Path) -> Path:
    path = Path(base_path)
    if not path.is_absolute():
        return Path(__file__).resolve().parents[2] / path
    return path


def load_orchestrator(config_path: str, base_path: Path) -> OmegaOrchestrator:
    config_file = base_path / config_path if not Path(config_path).is_absolute() else Path(config_path)
    config = load_config(config_file)
    return OmegaOrchestrator(config=config, base_path=base_path)


async def run_command(orchestrator: OmegaOrchestrator, cycles: int) -> None:
    await orchestrator.run(cycles if cycles > 0 else None)


def pause_command(orchestrator: OmegaOrchestrator) -> None:
    orchestrator.pause()
    orchestrator.persist_state()


def resume_command(orchestrator: OmegaOrchestrator) -> None:
    orchestrator.resume()
    orchestrator.persist_state()


def status_command(orchestrator: OmegaOrchestrator) -> None:
    jobs = orchestrator.registry.jobs()
    completed = sum(1 for job in jobs if job.status == JobStatus.COMPLETED)
    pending = sum(1 for job in jobs if job.status in {JobStatus.PENDING, JobStatus.ACTIVE})
    print(f"Jobs tracked: {len(jobs)} | Completed: {completed} | Pending: {pending} | Paused: {orchestrator.paused}")


def main(argv: Optional[list[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    base_path = resolve_base_path(args.base_path)
    orchestrator = load_orchestrator(args.config, base_path)

    if args.command == "run":
        asyncio.run(run_command(orchestrator, args.cycles))
    elif args.command == "pause":
        pause_command(orchestrator)
    elif args.command == "resume":
        resume_command(orchestrator)
    elif args.command == "status":
        status_command(orchestrator)


if __name__ == "__main__":
    main()
