"""Entry-point for the Huxley–Gödel Machine showcase demo."""
from __future__ import annotations

import argparse
from pathlib import Path
import random
import sys

PACKAGE_ROOT = Path(__file__).resolve().parent
REPO_ROOT = PACKAGE_ROOT.parent.parent
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.append(str(PACKAGE_ROOT))
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

try:  # pragma: no cover - optional rich dependency
    from rich.console import Console
    from rich.table import Table
except ImportError:  # pragma: no cover - fallback for minimal environments
    Console = None
    Table = None

from src.configuration import DemoConfiguration
from src.engine import HGMEngine, SimulationEnvironment
from src.thermostat import Thermostat
from src.sentinel import Sentinel
from src.reporting import render_markdown, export_json
from src.baseline import GreedyBaseline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Huxley–Gödel Machine Demo")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).parent / "config" / "default_config.json",
        help="Path to the demo configuration file.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Directory to store generated artifacts.",
    )
    parser.add_argument(
        "--legacy",
        action="store_true",
        help="Run the original simulator interface shipped with AGI Jobs v0 (v2).",
    )
    return parser.parse_args()


def ensure_output_dir(base: Path) -> Path:
    base.mkdir(parents=True, exist_ok=True)
    return base


def main() -> None:
    args = parse_args()
    config = DemoConfiguration.load(args.config)

    if args.legacy:
        from demo.huxley_godel_machine_v0.simulator.__main__ import (  # pylint: disable=import-error
            main as legacy_main,
        )

        legacy_main([])
        return
    rng = random.Random(config.random_seed)
    console = Console() if Console else None

    simulation = SimulationEnvironment(config.simulation, rng)
    engine = HGMEngine(config, rng, simulation)
    thermostat = Thermostat(config.thermostat, engine)
    sentinel = Sentinel(config.sentinel, engine)

    root = engine.seed_root(
        label=config.initial_agent.label,
        description=config.initial_agent.description,
        quality=config.initial_agent.base_quality,
    )

    if console:
        console.rule("[bold magenta]Huxley–Gödel Machine :: Autonomous Clade Evolution")
        console.print(f"Root agent `{root.identifier}` initialised with quality {root.quality:.2f}")
    else:
        print("=== Huxley–Gödel Machine :: Autonomous Clade Evolution ===")
        print(f"Root agent {root.identifier} initialised with quality {root.quality:.2f}")

    while True:
        sentinel_state = sentinel.inspect()
        if sentinel_state.halted:
            if console:
                console.print(f"[red]Sentinel halt:[/] {sentinel_state.reason}")
            else:
                print(f"Sentinel halt: {sentinel_state.reason}")
            break

        decision = engine.next_decision()
        if decision is None:
            break

        if decision.action == "expand":
            child = engine.expand_agent(decision.agent_id)
            message = f"Expansion: {decision.agent_id} -> {child.identifier} (quality {child.quality:.2f})"
            if console:
                console.print(f"[cyan]{message}")
            else:
                print(message)
        else:
            success, revenue, cost = engine.evaluate_agent(decision.agent_id)
            thermostat.observe(engine.ledger.roi)
            thermostat.adjust()
            message = (
                f"Evaluation: {decision.agent_id} => {'✅' if success else '❌'} | "
                f"Revenue=${revenue:,.2f} Cost=${cost:,.2f} ROI={engine.ledger.roi:,.2f}x"
            )
            if console:
                console.print(f"[green]{message}")
            else:
                print(message)

        engine.increment_iteration()
        engine.record_snapshot()

    best = engine.best_agent()
    if best is None:
        console.print("[red]No agent results available.")
        return

    champion_msg = (
        f"Champion {best.identifier} success rate {best.success_rate:.1%}, "
        f"quality {best.quality:.2f}"
    )
    final_metrics_msg = (
        f"GMV ${engine.ledger.gmv:,.2f} | Cost ${engine.ledger.cost:,.2f} | "
        f"ROI {engine.ledger.roi:,.2f}x"
    )
    if console:
        console.rule("[bold green]Final Champion")
        console.print(champion_msg)
        console.print(final_metrics_msg)
        console.rule("[bold blue]Greedy Baseline Benchmark")
    else:
        print("=== Final Champion ===")
        print(champion_msg)
        print(final_metrics_msg)
        print("=== Greedy Baseline Benchmark ===")
    baseline_rng = random.Random(config.random_seed + 99)
    baseline = GreedyBaseline(
        config.baseline,
        config.simulation,
        baseline_rng,
        root_quality=config.initial_agent.base_quality,
        label=config.initial_agent.label,
    )
    baseline_state = baseline.run(engine.iteration or 1, cost_limit=engine.ledger.cost)
    baseline_msg = (
        f"Baseline GMV ${baseline_state.ledger.gmv:,.2f} | Cost ${baseline_state.ledger.cost:,.2f} | "
        f"ROI {baseline_state.ledger.roi:,.2f}x"
    )
    if console:
        console.print(baseline_msg)
    else:
        print(baseline_msg)
    lift = engine.ledger.gmv - baseline_state.ledger.gmv
    if console:
        console.print(f"GMV Lift: ${lift:,.2f}")
    else:
        print(f"GMV Lift: ${lift:,.2f}")

    output_dir = ensure_output_dir(
        args.output_dir
        if args.output_dir
        else Path(__file__).parent / config.reporting.artifact_directory
    )

    markdown_path = output_dir / "report.md"
    json_path = output_dir / "report.json"

    markdown = render_markdown(engine.ledger, engine.ledger.history, best, engine.nodes.values())
    if config.reporting.export_markdown:
        markdown_path.write_text(markdown, encoding="utf-8")
        if console:
            console.print(f"[yellow]Markdown report saved to {markdown_path}")
        else:
            print(f"Markdown report saved to {markdown_path}")

    if config.reporting.export_json:
        export_json(engine.ledger, engine.ledger.history, best, json_path)
        if console:
            console.print(f"[yellow]JSON data saved to {json_path}")
        else:
            print(f"JSON data saved to {json_path}")

    if Table and console:
        table = Table(title="Comparative Performance", show_header=True, header_style="bold magenta")
        table.add_column("Strategy")
        table.add_column("GMV")
        table.add_column("Cost")
        table.add_column("ROI")
        table.add_row(
            "HGM",
            f"${engine.ledger.gmv:,.2f}",
            f"${engine.ledger.cost:,.2f}",
            f"{engine.ledger.roi:,.2f}x",
        )
        table.add_row(
            "Greedy Baseline",
            f"${baseline_state.ledger.gmv:,.2f}",
            f"${baseline_state.ledger.cost:,.2f}",
            f"{baseline_state.ledger.roi:,.2f}x",
        )
        console.print(table)
    else:
        print("Comparative Performance:")
        print(f"  HGM -> GMV ${engine.ledger.gmv:,.2f}, Cost ${engine.ledger.cost:,.2f}, ROI {engine.ledger.roi:,.2f}x")
        print(
            "  Greedy Baseline -> GMV ${:.2f}, Cost ${:.2f}, ROI {:.2f}x".format(
                baseline_state.ledger.gmv,
                baseline_state.ledger.cost,
                baseline_state.ledger.roi,
            )
        )


if __name__ == "__main__":
    main()
