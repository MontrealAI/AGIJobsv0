from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .config import load_config


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Owner control console for Kardashev-II Omega-Grade demo")
    parser.add_argument("--config", default="config/default_config.json", help="Configuration file to update")
    sub = parser.add_subparsers(dest="command", required=True)

    stake = sub.add_parser("set-stake", help="Update validator stake ratio")
    stake.add_argument("value", type=float)

    pause = sub.add_parser("set-pause", help="Toggle pause flag in stored state")
    pause.add_argument("value", choices=["true", "false"], help="Pause state")

    energy = sub.add_parser("set-energy", help="Update planetary energy capacity")
    energy.add_argument("value", type=float)

    return parser


def write_config(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def set_stake(config_path: Path, value: float) -> None:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config.setdefault("validators", {})["stake_ratio"] = value
    write_config(config_path, config)


def set_pause(state_path: Path, value: bool) -> None:
    if not state_path.exists():
        raise SystemExit("State file does not exist yet; run the orchestrator once before pausing from console.")
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["paused"] = value
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def set_energy(config_path: Path, value: float) -> None:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config.setdefault("resource_manager", {})["planetary_energy_gw"] = value
    write_config(config_path, config)


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    config_path = Path(args.config)
    base_path = Path(__file__).resolve().parents[2]
    config_file = base_path / config_path if not config_path.is_absolute() else config_path

    if args.command == "set-stake":
        set_stake(config_file, args.value)
    elif args.command == "set-pause":
        state_path = base_path / load_config(config_file).state_path
        set_pause(state_path, args.value == "true")
    elif args.command == "set-energy":
        set_energy(config_file, args.value)


if __name__ == "__main__":
    main()
