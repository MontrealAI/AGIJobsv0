#!/usr/bin/env python3
"""Run antifragility drills against a configured node."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from agi_alpha_node.config import load_config
from agi_alpha_node.safety import AntifragilityDrillRunner


def main() -> int:
    parser = argparse.ArgumentParser(description="Run antifragility drills")
    parser.add_argument("--config", default="demo/AGI-Alpha-Node-v0/config/operator.example.yaml")
    parser.add_argument("--output", default="demo/AGI-Alpha-Node-v0/state/antifragility-report.json")
    args = parser.parse_args()

    config = load_config(Path(args.config))
    runner = AntifragilityDrillRunner(config=config)
    report = runner.run_all()

    Path(args.output).write_text(json.dumps(report, indent=2))
    print(f"Wrote antifragility report to {args.output}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
