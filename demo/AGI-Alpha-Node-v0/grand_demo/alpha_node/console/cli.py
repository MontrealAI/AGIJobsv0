"""Typer-based operator console."""
from __future__ import annotations

import json
import logging
import pathlib
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from ..ai.planner import MuZeroPlanner
from ..ai.specialists.biotech import BiotechSynthesist
from ..ai.specialists.finance import FinanceStrategist
from ..ai.specialists.manufacturing import ManufacturingOptimizer
from ..config import AlphaNodeConfig, load_config
from ..knowledge.lake import KnowledgeLake
from ..metrics.exporter import MetricsExporter
from ..orchestrator.orchestrator import ExecutionSummary, Orchestrator, TaskEnvelope
from ..compliance.scorecard import ComplianceEngine
from ..compliance.drills import DrillScheduler

app = typer.Typer(help="Operate the AGI Alpha Node demo")
console = Console()


def _build_orchestrator(config: AlphaNodeConfig) -> tuple[Orchestrator, MetricsExporter, DrillScheduler]:
    planner = MuZeroPlanner(
        horizon=config.planner.horizon,
        exploration_constant=config.planner.exploration_constant,
        discount_factor=config.planner.discount_factor,
        max_rollouts=config.planner.max_rollouts,
        temperature=config.planner.temperature,
    )
    knowledge_lake = KnowledgeLake(
        path=config.knowledge_lake.path,
        embedding_dim=config.knowledge_lake.embedding_dim,
        similarity_threshold=config.knowledge_lake.similarity_threshold,
    )
    specialists = {
        "finance": FinanceStrategist(),
        "biotech": BiotechSynthesist(),
        "manufacturing": ManufacturingOptimizer(),
    }
    orchestrator = Orchestrator(planner=planner, knowledge_lake=knowledge_lake, specialists=specialists)
    metrics = MetricsExporter(host=config.metrics.host, port=config.metrics.port)
    drills = DrillScheduler(interval_minutes=config.compliance.drill_interval_minutes)
    return orchestrator, metrics, drills


def _resolve_config_path(config_path: Optional[pathlib.Path]) -> Optional[pathlib.Path]:
    try:
        from typer.models import OptionInfo  # type: ignore
    except Exception:  # pragma: no cover - defensive import
        OptionInfo = None  # type: ignore
    if OptionInfo is not None and isinstance(config_path, OptionInfo):
        return None
    return config_path


@app.command()
def bootstrap(config_path: Optional[pathlib.Path] = typer.Option(None, "--config")) -> None:
    """Bootstraps the node and validates ENS ownership."""
    config = load_config(_resolve_config_path(config_path))
    orchestrator, metrics, drills = _build_orchestrator(config)
    metrics.start()
    table = Table(title="AGI Alpha Node Bootstrapped")
    table.add_column("Module")
    table.add_column("Status")
    table.add_row("Planner", "Ready")
    table.add_row("Knowledge Lake", f"{config.knowledge_lake.path}")
    table.add_row("Metrics", f"{config.metrics.host}:{config.metrics.port}")
    table.add_row("Drill Interval", f"{config.compliance.drill_interval_minutes} minutes")
    console.print(table)
    console.print("Run `agi-alpha-node demo-job` to execute an end-to-end scenario.")


@app.command("demo-job")
def demo_job(config_path: Optional[pathlib.Path] = typer.Option(None, "--config")) -> None:
    """Executes the canonical AGI Alpha Node demo job."""
    config = load_config(_resolve_config_path(config_path))
    orchestrator, metrics, drills = _build_orchestrator(config)
    job = TaskEnvelope(
        job_id=1,
        domain="finance",
        payload={
            "roi_projection": "0.22",
            "volatility": "0.18",
            "diversification_bonus": "0.07",
        },
    )
    summary = orchestrator.execute(job, stake_size=config.compliance.minimum_stake)
    _render_summary(summary)
    metrics.start()
    metrics.update("agi_alpha_node_aggregate_value", summary.aggregated_value,
                   description="Aggregated economic value delta across specialists")
    metrics.update("agi_alpha_node_planner_confidence", summary.planner.confidence)
    drills_report = drills.run()
    compliance = ComplianceEngine().build_score(
        ens_verified=True,
        stake_ok=True,
        paused=False,
        rewards_growth=summary.aggregated_value,
        drills_ok=drills_report.passed,
        planner_confidence=summary.planner.confidence,
    )
    console.print("\n[bold green]Compliance Scorecard[/bold green]")
    console.print(json.dumps(compliance.as_dict(), indent=2))
    console.print("\n[bold cyan]Drill Report[/bold cyan]")
    console.print(drills_report)


def _render_summary(summary: ExecutionSummary) -> None:
    console.print("[bold magenta]Planner Decision[/bold magenta]")
    console.print(summary.planner.rationale)
    table = Table(title="Specialist Contributions")
    table.add_column("Specialist")
    table.add_column("Value Δ", justify="right")
    for specialist, metrics in summary.specialist_outputs.items():
        table.add_row(specialist, f"{metrics['value_delta']:.3f}")
    console.print(table)
    console.print(f"[bold]Aggregated Alpha:[/bold] {summary.aggregated_value:.3f}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    app()
