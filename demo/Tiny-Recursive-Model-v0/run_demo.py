"""Command line interface for the Tiny Recursive Model demo."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

from tiny_recursive_model import DemoConfig, DemoOrchestrator
from tiny_recursive_model.reporting import export_report


APP_ROOT = Path(__file__).resolve().parent
DEFAULT_CONFIG = APP_ROOT / "config" / "defaults.yaml"
ARTIFACT_DIR = APP_ROOT / "artifacts"
CHECKPOINT_BEST = ARTIFACT_DIR / "checkpoints" / "trm_best.json"

app = typer.Typer(help="Tiny Recursive Model iconic demo controller")
console = Console()


def load_config(config_path: Optional[Path]) -> DemoConfig:
    if config_path is None:
        return DemoConfig.from_file(DEFAULT_CONFIG)
    return DemoConfig.from_file(config_path)


def build_orchestrator(config: DemoConfig) -> DemoOrchestrator:
    return DemoOrchestrator(config=config, artifact_dir=ARTIFACT_DIR)


@app.command()
def train(config_path: Optional[Path] = typer.Option(None, "--config", path_type=Path)) -> None:
    """Train the Tiny Recursive Model from scratch."""

    config = load_config(config_path)
    orchestrator = build_orchestrator(config)
    orchestrator.train()
    console.print("[bold green]Training completed. Checkpoints saved.[/bold green]")


@app.command()
def simulate(
    config_path: Optional[Path] = typer.Option(None, "--config", path_type=Path),
    trials: Optional[int] = typer.Option(None, "--trials"),
) -> None:
    """Run ROI simulation comparing Greedy, LLM, and TRM approaches."""

    config = load_config(config_path)
    if trials is not None:
        config = config.merged({"simulation": {"trials": trials}})
    orchestrator = build_orchestrator(config)
    if CHECKPOINT_BEST.exists():
        orchestrator.engine.restore(CHECKPOINT_BEST)
        console.print(f"Loaded checkpoint {CHECKPOINT_BEST}")
    else:
        console.print("[yellow]No checkpoint found; training a fresh model.[/yellow]")
        orchestrator.train()
    results = orchestrator.simulate(config.simulation.trials)
    console.print(orchestrator.summary_table(results))
    metrics = orchestrator.export_metrics(results)
    export_report(ARTIFACT_DIR, results, metrics)


@app.command()
def bootstrap(config_path: Optional[Path] = typer.Option(None, "--config", path_type=Path)) -> None:
    """Train, simulate, and generate full reports in a single command."""

    config = load_config(config_path)
    orchestrator = build_orchestrator(config)
    orchestrator.train()
    results = orchestrator.simulate(config.simulation.trials)
    console.print(orchestrator.summary_table(results))
    metrics = orchestrator.export_metrics(results)
    export_report(ARTIFACT_DIR, results, metrics)
    console.print("[bold green]Bootstrap complete. Explore web/index.html for the interactive story.[/bold green]")


@app.command()
def deploy(
    registry: str = typer.Option(..., "--registry", help="Deployment registry or endpoint"),
    config_path: Optional[Path] = typer.Option(None, "--config", path_type=Path),
) -> None:
    """Produce a deployment manifest for the trained TRM."""

    config = load_config(config_path)
    manifest = {
        "registry": registry,
        "checkpoint": str(CHECKPOINT_BEST.resolve()),
        "economics": config.economics.dict(),
        "thermostat": config.thermostat.dict(),
        "sentinel": config.sentinel.dict(),
    }
    manifest_path = ARTIFACT_DIR / "deployment_manifest.json"
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    console.print(f"Deployment manifest written to {manifest_path}")


if __name__ == "__main__":
    app()
