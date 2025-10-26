"""Command line entrypoint for the Omega-grade demo."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any, Dict

from .governance import GovernanceParameters
from .orchestrator import OrchestratorConfig, run_demo


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Kardashev-II Omega-Grade α-AGI Business 3 demo")
    parser.add_argument("--config", type=Path, default=Path(__file__).resolve().parent.parent / "config" / "default.json")
    parser.add_argument("--max-cycles", type=int, default=None, help="Optional safety limit on orchestration cycles")
    parser.add_argument("--no-simulation", action="store_true", help="Disable planetary simulation integration")
    parser.add_argument("--checkpoint", type=Path, help="Override checkpoint path")
    parser.add_argument("--no-resume", action="store_true", help="Start without rehydrating checkpoint state")
    return parser.parse_args()


def load_config(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def build_config(data: Dict[str, Any], overrides: argparse.Namespace) -> OrchestratorConfig:
    defaults = OrchestratorConfig()
    governance = GovernanceParameters(**data.get("governance", {}))
    base_dir = overrides.config.parent if overrides.config else Path.cwd()
    raw_checkpoint = Path(data.get("checkpoint_path", "checkpoint.json"))
    checkpoint_path = overrides.checkpoint or (base_dir / raw_checkpoint if not raw_checkpoint.is_absolute() else raw_checkpoint)
    raw_control = Path(data.get("control_channel_file", defaults.control_channel_file))
    control_file = raw_control if raw_control.is_absolute() else (base_dir / raw_control)
    config = OrchestratorConfig(
        mission_name=data.get("mission_name", defaults.mission_name),
        checkpoint_path=checkpoint_path,
        checkpoint_interval_seconds=data.get("checkpoint_interval_seconds", defaults.checkpoint_interval_seconds),
        resume_from_checkpoint=not overrides.no_resume if overrides.no_resume else data.get("resume_from_checkpoint", defaults.resume_from_checkpoint),
        enable_simulation=False if overrides.no_simulation else data.get("enable_simulation", defaults.enable_simulation),
        operator_account=data.get("operator_account", defaults.operator_account),
        base_agent_tokens=data.get("base_agent_tokens", defaults.base_agent_tokens),
        energy_capacity=data.get("energy_capacity", defaults.energy_capacity),
        compute_capacity=data.get("compute_capacity", defaults.compute_capacity),
        governance=governance,
        validator_names=data.get("validator_names", defaults.validator_names),
        worker_specs=data.get("worker_specs", defaults.worker_specs),
        strategist_names=data.get("strategist_names", defaults.strategist_names),
        cycle_sleep_seconds=data.get("cycle_sleep_seconds", defaults.cycle_sleep_seconds),
        max_cycles=overrides.max_cycles if overrides.max_cycles is not None else data.get("max_cycles"),
        insight_interval_seconds=data.get("insight_interval_seconds", defaults.insight_interval_seconds),
        control_channel_file=control_file,
    )
    return config


def main() -> None:
    args = parse_args()
    data = load_config(args.config)
    config = build_config(data, args)
    asyncio.run(run_demo(config))


if __name__ == "__main__":
    main()
