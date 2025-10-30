"""Command-line interface for the Tiny Recursive Model demo."""

from __future__ import annotations

from pathlib import Path
import sys

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

CURRENT_DIR = Path(__file__).resolve().parent
SRC_DIR = CURRENT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from tiny_recursive_model_v0.orchestrator import TinyRecursiveDemoOrchestrator

app = typer.Typer(help="Tiny Recursive Model Demo controller")
console = Console()


def _render_table(orchestrator: TinyRecursiveDemoOrchestrator, summary_markdown: str) -> None:
    table = Table(title="Tiny Recursive Model Economic Scoreboard")
    table.add_column("Metric", style="cyan", justify="left")
    table.add_column("Value", justify="right")
    trm_summary = orchestrator.simulation.ledger
    table.add_row("Total GMV", f"${trm_summary.total_value:,.2f}")
    table.add_row("Total Cost", f"${trm_summary.total_cost:,.4f}")
    roi_display = "∞" if trm_summary.roi == float("inf") else f"{trm_summary.roi:.2f}"
    table.add_row("ROI", roi_display)
    console.print(table)
    console.print(Panel(summary_markdown, title="Engine Comparison", expand=False))


@app.command()
def run(config: Path = typer.Option(Path("config/trm_demo_config.yaml"), help="Path to config")) -> None:
    """Train the TRM, run the conversion simulation, and print a report."""

    orchestrator = TinyRecursiveDemoOrchestrator(config)
    console.print(Panel.fit("Launching Tiny Recursive Model Demo", style="bold magenta"))
    report = orchestrator.run()
    summary_markdown = orchestrator.render_summary(report)
    _render_table(orchestrator, summary_markdown)
    console.print(
        Panel.fit(
            "Telemetry → assets/telemetry.jsonl\n"
            f"Executive report → {orchestrator.report_path}",
            style="green",
        )
    )


@app.command()
def owner(
    section: str = typer.Argument(..., help="Configuration section to update (e.g., 'trm')"),
    key: str = typer.Argument(..., help="Field to update (e.g., 'inner_cycles')"),
    value: str = typer.Argument(..., help="New value"),
    config: Path = typer.Option(Path("config/trm_demo_config.yaml"), help="Path to config"),
) -> None:
    """Owner override to update configuration live."""

    orchestrator = TinyRecursiveDemoOrchestrator(config)
    target_section = getattr(orchestrator.config, section)
    current_value = getattr(target_section, key)
    if isinstance(current_value, int):
        cast_value = int(float(value))
    elif isinstance(current_value, float):
        cast_value = float(value)
    else:
        cast_value = value
    change = orchestrator.console.update(section, key, cast_value)
    orchestrator.console.persist(config)
    console.print(
        Panel.fit(
            f"Updated {change.section}.{change.key} from {change.old_value} to {change.new_value}",
            title="Governance",
            style="yellow",
        )
    )


if __name__ == "__main__":
    app()
