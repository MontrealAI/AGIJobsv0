"""Command line interface for the Tiny Recursive Model demo."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from rich import box
from rich.console import Console
from rich.table import Table

from trm_demo.config import DemoSettings, load_settings
from trm_demo.engine import TrmEngine
from trm_demo.ledger import EconomicLedger
from trm_demo.sentinel import Sentinel
from trm_demo.simulation import run_simulation
from trm_demo.thermostat import Thermostat

app = typer.Typer(
    help="Tiny Recursive Model demo orchestrated by AGI Jobs v0 (v2)",
    invoke_without_command=True,
)
console = Console()


def _load_settings(config_path: Optional[Path]) -> DemoSettings:
    base = Path(__file__).resolve().parent
    path = config_path or (base / "config" / "default_trm_config.yaml")
    return load_settings(path)


def _ensure_checkpoint(engine: TrmEngine, checkpoint_path: Path) -> None:
    if checkpoint_path.exists():
        console.print(f"[green]Loading checkpoint {checkpoint_path}[/green]")
        engine.load_checkpoint(checkpoint_path)
    else:
        console.print(
            "[yellow]No checkpoint found. Run `python run_demo.py train` first for best results.[/yellow]"
        )


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context) -> None:
    """Show guidance when no command is provided."""
    if ctx.invoked_subcommand is not None:
        return

    console.print(
        """
[bold cyan]Tiny Recursive Model Demo[/bold cyan]
This CLI powers the AGI Jobs v0 (v2) Tiny Recursive Model experience. Choose a command:
• [green]train[/green] — learn a lightweight recursive reasoner on synthetic tasks.
• [green]simulate[/green] — benchmark TRM versus baselines with guardrails engaged.
• [green]explain[/green] — recap what operators can do with this demo.
        """
    )
    typer.echo(ctx.get_help())


@app.command()
def train(config: Optional[Path] = typer.Option(None, help="Path to config YAML.")) -> None:
    """Train the Tiny Recursive Model on synthetic reasoning puzzles."""
    settings = _load_settings(config)
    engine = TrmEngine(settings)
    report = engine.train()
    console.print("[bold green]Training completed[/bold green]")
    console.print(f"Epochs: {report.epochs_run}")
    console.print(f"Train loss: {report.train_loss:.4f}")
    console.print(f"Validation loss: {report.val_loss:.4f}")
    console.print(f"Checkpoint saved to: {report.best_checkpoint}")


@app.command()
def simulate(
    config: Optional[Path] = typer.Option(None, help="Path to config YAML."),
    trials: int = typer.Option(128, help="Number of tasks to simulate."),
    seed: int = typer.Option(0, help="Random seed for reproducibility."),
) -> None:
    """Simulate TRM vs. baselines and display ROI metrics."""
    settings = _load_settings(config)
    engine = TrmEngine(settings)
    checkpoint = engine._resolve_path(settings.training.checkpoint_path)
    _ensure_checkpoint(engine, checkpoint)

    ledger = EconomicLedger(
        default_success_value=settings.ledger.default_success_value,
        base_cost_per_call=settings.ledger.base_cost_per_call,
        cost_per_inner_step=settings.ledger.cost_per_inner_step,
        cost_per_outer_step=settings.ledger.cost_per_outer_step,
    )
    thermostat = Thermostat(settings.thermostat)
    sentinel = Sentinel(settings.sentinel)

    summary = run_simulation(
        engine=engine,
        thermostat=thermostat,
        sentinel=sentinel,
        ledger=ledger,
        settings=settings,
        trials=trials,
        seed=seed,
    )

    table = Table(title="TRM Demo ROI Comparison", box=box.ROUNDED, show_lines=True)
    table.add_column("Model")
    table.add_column("Success Rate", justify="right")
    table.add_column("ROI", justify="right")
    table.add_column("Avg Latency (ms)", justify="right")
    table.add_column("Total Cost", justify="right")

    def _add_row(name: str, metrics) -> None:
        success_rate = metrics.successes / metrics.trials if metrics.trials else 0.0
        table.add_row(
            name,
            f"{success_rate * 100:.1f}%",
            f"{metrics.roi():.2f}",
            f"{metrics.avg_latency():.1f}",
            f"${metrics.total_cost:.4f}",
        )

    _add_row("Greedy Heuristic", summary.greedy)
    _add_row("Large LLM", summary.llm)
    _add_row("Tiny Recursive Model", summary.trm)

    console.print(table)
    if summary.sentinel_triggered:
        console.print(
            f"[red]Sentinel halted TRM due to: {summary.sentinel_reason}[/red]",
            style="bold",
        )
    else:
        console.print("[green]Sentinel guardrails nominal[/green]")

    console.print("\nThermostat Parameter Trace (inner, outer, halt threshold):")
    for idx, state in enumerate(summary.thermostat_trace[:10]):
        console.print(f"  Iteration {idx + 1}: {state}")


@app.command()
def explain() -> None:
    """Explain how AGI Jobs v0 (v2) empowers non-technical builders."""
    console.print(
        """
[bold cyan]Tiny Recursive Model Demo[/bold cyan]
This experience turns AGI Jobs v0 (v2) into a complete co-pilot that:
• Auto-builds training pipelines for recursive reasoning networks.
• Instruments ROI, thermostat control, and sentinel guardrails.
• Provides no-code levers (config YAML + Streamlit UI) so operators steer economics.
• Delivers transparent telemetry tables and diagrams for stakeholders.
        """
    )


if __name__ == "__main__":
    app()
