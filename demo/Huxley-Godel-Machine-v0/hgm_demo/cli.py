"""Command-line entry point for the HGM demo."""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
from pathlib import Path

if __package__ in (None, ""):
    PACKAGE_ROOT = Path(__file__).resolve().parent
    PACKAGE_PARENT = PACKAGE_ROOT.parent
    for candidate in (PACKAGE_ROOT, PACKAGE_PARENT):
        if str(candidate) not in sys.path:
            sys.path.append(str(candidate))
    from hgm_demo.baseline import GreedyBaseline
    from hgm_demo.config import ConfigError, DemoConfig, load_config
    from hgm_demo.engine import HGMEngine
    from hgm_demo.orchestrator import Orchestrator
    from hgm_demo.persistence import Persistence
    from hgm_demo.report import format_table
    from hgm_demo.simulation import Simulator
else:
    from .baseline import GreedyBaseline
    from .config import ConfigError, DemoConfig, load_config
    from .engine import HGMEngine
    from .orchestrator import Orchestrator
    from .persistence import Persistence
    from .report import format_table
    from .simulation import Simulator


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Huxley–Gödel Machine demo")
    parser.add_argument(
        "--config",
        default=Path(__file__).resolve().parent.parent / "config" / "demo_agialpha.yml",
        type=Path,
        help="Path to the YAML configuration file",
    )
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON report")
    return parser.parse_args()


async def run_demo(config: DemoConfig) -> dict:
    rng = random.Random(config.seed)
    engine = HGMEngine(
        tau=config.tau,
        alpha=config.alpha,
        epsilon=config.epsilon,
        max_expansions=config.max_expansions,
        max_evaluations=config.max_evaluations,
        rng=rng,
    )
    root = engine.create_root({"quality": 0.6})
    simulator = Simulator(config, rng)
    simulator.set_initial_quality(root.identifier, 0.6)
    persistence = Persistence(Path("demo_hgm.sqlite"))
    orchestrator = Orchestrator(engine, simulator, config, persistence)

    result = await orchestrator.run()
    persistence.close()
    return result.report


def main() -> None:
    args = parse_args()
    try:
        config = load_config(args.config)
    except (FileNotFoundError, ConfigError) as exc:  # pragma: no cover - CLI error path
        raise SystemExit(str(exc))

    report = asyncio.run(run_demo(config))
    baseline = GreedyBaseline(config, random.Random(config.seed + 1)).run()

    if args.json:
        payload = {"hgm": report, "baseline": baseline.__dict__}
        print(json.dumps(payload, indent=2))
    else:
        print(format_table(report, baseline))


if __name__ == "__main__":  # pragma: no cover
    main()

