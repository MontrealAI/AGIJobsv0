from __future__ import annotations

import argparse
import json
import pathlib

from .config_loader import load_config
from .loop import AbsoluteZeroDemo


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Absolute Zero Reasoner demo runner")
    parser.add_argument("--config", type=pathlib.Path, default=None, help="Optional configuration YAML file")
    parser.add_argument("--iterations", type=int, default=None, help="Override iteration count")
    parser.add_argument("--tasks", type=int, default=None, help="Override tasks per iteration")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config(args.config)
    if args.iterations is not None:
        config.raw["azr"]["iterations"] = args.iterations
    if args.tasks is not None:
        config.raw["azr"]["tasks_per_iteration"] = args.tasks
    demo = AbsoluteZeroDemo(config)
    summaries = demo.run()
    snapshot = {
        "config": json.loads(config.as_json()),
        "iterations": len(summaries),
        "final_roi": demo.economics.roi,
        "gmv_total": demo.economics.gmv_total,
        "cost_total": demo.economics.cost_total,
        "baselines": demo.trr.snapshot(),
    }
    print(json.dumps(snapshot, indent=2))


if __name__ == "__main__":
    main()
