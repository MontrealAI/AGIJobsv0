"""Narrative-first CLI harnessing the MuZero-style planner."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import click

os.environ.setdefault("_TYPER_FORCE_DISABLE_TERMINAL", "1")

_ORIGINAL_MAKE_METAVAR = click.core.Parameter.make_metavar


def _patched_make_metavar(parameter: click.core.Parameter, ctx: Optional[click.Context] = None) -> str:
    if ctx is None:
        ctx = click.Context(click.Command(parameter.name or "param"))
    return _ORIGINAL_MAKE_METAVAR(parameter, ctx)


if _ORIGINAL_MAKE_METAVAR.__code__.co_argcount < 2:  # pragma: no cover - backward compatibility
    pass
else:  # pragma: no cover - executed during CLI initialisation
    click.core.Parameter.make_metavar = _patched_make_metavar

import torch
import typer
from rich.console import Console
from rich.progress import track

from .configuration import load_demo_config
from .evaluation import evaluate_planner
from .network import make_network
from .sentinel import SentinelMonitor
from .thermostat import PlanningThermostat
from .training import MuZeroTrainer

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "config" / "default.yaml"

app = typer.Typer(help="MuZero-style AGI Jobs planning demo")
console = Console()


def _prepare_trainer(config_path: Path) -> tuple[MuZeroTrainer, PlanningThermostat, SentinelMonitor]:
    if not config_path.exists():
        raise typer.BadParameter(f"Configuration file not found: {config_path}")
    demo_config = load_demo_config(config_path)
    if demo_config.environment.rng_seed is not None:
        torch.manual_seed(demo_config.environment.rng_seed)
    network = make_network(demo_config.network)
    thermostat = PlanningThermostat(demo_config.thermostat, demo_config.environment, demo_config.planner)
    sentinel = SentinelMonitor(demo_config.sentinel, demo_config.environment)
    trainer = MuZeroTrainer(network, demo_config.training, thermostat=thermostat, sentinel=sentinel)
    return trainer, thermostat, sentinel


@app.command()
def train(
    iterations: int = typer.Option(5, help="Number of self-play/training cycles"),
    episodes_per_iteration: int = typer.Option(6, help="Self-play episodes per cycle"),
    checkpoint: Optional[Path] = typer.Option(None, help="Where to store the trained network"),
    config_path: Path = typer.Option(DEFAULT_CONFIG, help="YAML configuration describing the demo"),
) -> None:
    """Run a MuZero training loop with adaptive planning controls."""

    trainer, thermostat, sentinel = _prepare_trainer(config_path)
    network = trainer.network

    for iteration in track(range(iterations), description="Self-play & learning"):
        trainer.self_play(episodes_per_iteration)
        metrics = trainer.train_step()
        telemetry = thermostat.telemetry()
        sentinel_stats = trainer.sentinel_status()
        console.log(
            "Iteration %d | loss=%.4f | avg_sim=%.1f | sentinel_mae=%.2f | alert=%s"
            % (
                iteration + 1,
                metrics.get("loss", 0.0),
                telemetry.average_simulations,
                sentinel_stats.get("mae", 0.0),
                "YES" if sentinel_stats.get("alert") else "no",
            )
        )

    if checkpoint:
        checkpoint.parent.mkdir(parents=True, exist_ok=True)
        torch.save(network.state_dict(), checkpoint)
        console.log(f"Saved model checkpoint to {checkpoint}")


@app.command()
def evaluate(
    checkpoint: Optional[Path] = typer.Option(None, help="Path to trained network weights"),
    episodes: int = typer.Option(25, help="Episodes per strategy for evaluation"),
    config_path: Path = typer.Option(DEFAULT_CONFIG, help="YAML configuration describing the demo"),
) -> None:
    """Compare MuZero planning to baseline strategies under the sentinel."""

    trainer, thermostat, sentinel = _prepare_trainer(config_path)
    network = trainer.network
    if checkpoint and checkpoint.exists():
        state = torch.load(checkpoint, map_location="cpu")
        network.load_state_dict(state)
        console.log(f"Loaded checkpoint from {checkpoint}")
    network.eval()

    evaluate_planner(
        network,
        trainer.config.environment,
        trainer.config.planner,
        episodes=episodes,
        console=console,
        thermostat=thermostat,
        sentinel=sentinel,
    )

    status = sentinel.status()
    console.log(
        "Sentinel summary: episodes=%d, mae=%.2f, alert=%s, fallback=%s"
        % (
            status.episodes_observed,
            status.mean_absolute_error,
            "YES" if status.alert_active else "no",
            "YES" if status.fallback_required else "no",
        )
    )


if __name__ == "__main__":
    app()
