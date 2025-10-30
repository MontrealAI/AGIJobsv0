"""Command line interface empowering non-technical operators."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import torch
import typer
from rich.console import Console
from rich.progress import track

from .environment import EnvironmentConfig, vector_size
from .evaluation import evaluate_planner
from .mcts import PlannerSettings
from .network import NetworkConfig, make_network, MuZeroNetwork
from .training import MuZeroTrainer, TrainingConfig

app = typer.Typer(help="MuZero-style AGI Jobs planning demo")
console = Console()


def default_training_config(seed: int = 7) -> tuple[MuZeroNetwork, TrainingConfig]:
    env_config = EnvironmentConfig(rng_seed=seed)
    observation_dim = vector_size(env_config)
    action_space = env_config.max_jobs + 1
    network_config = NetworkConfig(observation_dim=observation_dim, action_space_size=action_space)
    planner_settings = PlannerSettings(num_simulations=48, temperature=0.8)
    network = make_network(network_config)
    training_config = TrainingConfig(
        environment=env_config,
        network=network_config,
        planner=planner_settings,
        batch_size=16,
        unroll_steps=3,
        td_steps=4,
        learning_rate=2e-3,
        discount=env_config.discount,
        replay_buffer_size=512,
        policy_weight=1.0,
        value_weight=0.75,
        reward_weight=0.5,
        temperature=0.9,
    )
    return network, training_config


@app.command()
def train(
    iterations: int = typer.Option(5, help="Number of self-play/training cycles"),
    episodes_per_iteration: int = typer.Option(6, help="Self-play episodes per cycle"),
    checkpoint: Optional[Path] = typer.Option(None, help="Where to store the trained network"),
) -> None:
    """Run a compact MuZero training loop suitable for demos."""

    network, config = default_training_config()
    trainer = MuZeroTrainer(network, config)

    for iteration in track(range(iterations), description="Self-play & learning"):
        trainer.self_play(episodes_per_iteration)
        metrics = trainer.train_step()
        console.log(f"Iteration {iteration + 1}: loss={metrics['loss']:.4f}")

    if checkpoint:
        checkpoint.parent.mkdir(parents=True, exist_ok=True)
        torch.save(network.state_dict(), checkpoint)
        console.log(f"Saved model checkpoint to {checkpoint}")


@app.command()
def evaluate(
    checkpoint: Optional[Path] = typer.Option(None, help="Path to trained network weights"),
    episodes: int = typer.Option(25, help="Episodes per strategy for evaluation"),
) -> None:
    """Compare MuZero planning to baseline strategies."""

    network, config = default_training_config()
    if checkpoint and checkpoint.exists():
        state = torch.load(checkpoint, map_location="cpu")
        network.load_state_dict(state)
        console.log(f"Loaded checkpoint from {checkpoint}")
    network.eval()

    evaluate_planner(network, config.environment, config.planner, episodes=episodes, console=console)


if __name__ == "__main__":
    app()
