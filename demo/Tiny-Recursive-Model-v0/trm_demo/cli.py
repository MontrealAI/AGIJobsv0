"""Command line interface for the Tiny Recursive Model demo."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.table import Table

from .config import TinyRecursiveModelConfig
from .simulation import run_conversion_simulation
from .visualization import build_dashboard

console = Console()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the Tiny Recursive Model economic empowerment demo.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--opportunities",
        type=int,
        default=120,
        help="Number of opportunities to evaluate in the simulation.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed used for reproducibility.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional path to store JSON metrics.",
    )
    parser.add_argument(
        "--dashboard",
        type=Path,
        default=Path("demo/Tiny-Recursive-Model-v0/assets/roi_dashboard.html"),
        help="Path where an interactive dashboard is exported.",
    )
    parser.add_argument(
        "--relaxed-safety",
        action="store_true",
        help="Disable strict sentinel guardrails (useful for small test runs).",
    )
    return parser


def run_demo(opportunities: int, seed: int, output: Optional[Path], dashboard: Path, relaxed_safety: bool) -> None:
    config = TinyRecursiveModelConfig()
    console.rule("[bold magenta]AGI Jobs v0 • Tiny Recursive Model Demo")
    console.print("Bootstrapping the TRM engine with production-ready defaults...", style="cyan")
    metrics = run_conversion_simulation(
        opportunities=opportunities,
        seed=seed,
        config=config,
        output_path=output,
        safety_relaxed=relaxed_safety,
    )
    table = Table(title="Economic Impact Summary", style="bold")
    table.add_column("Strategy", justify="left")
    table.add_column("Conversions", justify="right")
    table.add_column("Success Rate", justify="right")
    table.add_column("GMV ($)", justify="right")
    table.add_column("Cost ($)", justify="right")
    table.add_column("ROI", justify="right")
    table.add_column("Avg Steps", justify="right")
    table.add_column("Avg Latency (ms)", justify="right")
    for metric in metrics:
        table.add_row(
            metric.strategy,
            f"{metric.conversions}",
            f"{metric.success_rate*100:.1f}%",
            f"{metric.total_value:,.2f}",
            f"{metric.total_cost:,.4f}",
            "∞" if metric.roi == float("inf") else f"{metric.roi:,.2f}",
            f"{metric.average_steps:.2f}",
            f"{metric.average_latency_ms:.1f}",
        )
    console.print(table)
    build_dashboard(metrics, dashboard)
    console.print(f"Interactive ROI dashboard exported to [green]{dashboard}[/]", style="green")
    if output:
        console.print(f"Raw metrics saved to [yellow]{output}[/]", style="yellow")


def main(argv: Optional[list[str]] = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)
    run_demo(args.opportunities, args.seed, args.output, args.dashboard, args.relaxed_safety)


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    main()

