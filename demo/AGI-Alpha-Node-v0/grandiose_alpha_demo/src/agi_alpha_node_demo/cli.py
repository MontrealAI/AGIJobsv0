"""Command-line interface for non-technical operators."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

from .alpha_node import AlphaNode
from .config import AlphaNodeConfig, load_demo_config
from .logging_utils import log


def _load_config(path: Path | None) -> AlphaNodeConfig:
    if path is None:
        return load_demo_config()
    data = json.loads(path.read_text(encoding="utf-8"))
    cfg = load_demo_config()
    cfg.metadata.update(data.get("metadata", {}))
    cfg.governance.owner_address = data.get("owner_address", cfg.governance.owner_address)
    return cfg


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Operate the AGI Alpha Node demo effortlessly.")
    parser.add_argument("command", choices=["bootstrap", "run", "pause", "resume", "state"], help="Action to perform")
    parser.add_argument("--config", type=Path, help="Optional path to a JSON config override")
    parser.add_argument("--job", help="Optional job description for the run command")
    return parser


def main(argv: list[str] | None = None) -> Dict[str, Any] | None:
    parser = build_parser()
    args = parser.parse_args(argv)
    config = _load_config(args.config)
    node = AlphaNode(config)
    node.start()

    if args.command == "bootstrap":
        log("bootstrap_complete", state=node.export_state())
        return node.export_state()

    if args.command == "run":
        result = node.run_job_cycle(job=args.job)
        log("run_complete", result=result)
        return result

    if args.command == "pause":
        node.pause()
        return node.export_state()

    if args.command == "resume":
        node.resume()
        return node.export_state()

    if args.command == "state":
        return node.export_state()

    raise ValueError(f"Unknown command: {args.command}")


if __name__ == "__main__":  # pragma: no cover
    main()
