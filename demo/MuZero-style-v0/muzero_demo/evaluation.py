"""Evaluation helpers comparing MuZero with baseline strategies."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List

import numpy as np
import torch
from rich.console import Console
from rich.table import Table

from .baselines import greedy_policy, policy_head_action
from .environment import AGIJobsPlanningEnv, EnvironmentConfig
from .mcts import MuZeroPlanner, PlannerSettings
from .network import MuZeroNetwork


@dataclass
class EvaluationResult:
    name: str
    average_utility: float
    std_utility: float
    average_discounted_return: float
    episodes: int


def evaluate_planner(
    network: MuZeroNetwork,
    env_config: EnvironmentConfig,
    planner_settings: PlannerSettings,
    episodes: int = 50,
    console: Console | None = None,
) -> List[EvaluationResult]:
    console = console or Console()
    console.rule("[bold cyan]MuZero Economic Impact Evaluation")

    env = AGIJobsPlanningEnv(env_config)
    planner = MuZeroPlanner(network, planner_settings)

    def muzero_action(obs) -> int:
        obs_tensor = torch.from_numpy(obs.vector).float()
        policy, _, _ = planner.run(obs_tensor, obs.legal_actions)
        return int(torch.argmax(policy).item())

    strategies: List[tuple[str, Callable]] = [
        ("MuZero Planner", muzero_action),
        ("Greedy Utility", greedy_policy),
        ("Policy Head Only", lambda obs: policy_head_action(network, torch.from_numpy(obs.vector).float(), obs.legal_actions)),
    ]

    results: List[EvaluationResult] = []
    for name, policy_fn in strategies:
        utilities: List[float] = []
        discounted: List[float] = []
        for episode_idx in range(episodes):
            observation = env.reset()
            done = False
            total_utility = 0.0
            while not done:
                action = policy_fn(observation)
                step = env.step(action)
                total_utility += step.reward
                observation = step.observation
                done = step.done
            history = env.summarize_history()
            utilities.append(total_utility)
            discounted.append(history["discounted_return"])
        result = EvaluationResult(
            name=name,
            average_utility=float(np.mean(utilities)),
            std_utility=float(np.std(utilities)),
            average_discounted_return=float(np.mean(discounted)),
            episodes=episodes,
        )
        results.append(result)

    table = Table(title="AGI Jobs Strategy Comparison", show_lines=True)
    table.add_column("Strategy", style="bold magenta")
    table.add_column("Avg Utility", justify="right")
    table.add_column("Std Dev", justify="right")
    table.add_column("Avg Discounted Return", justify="right")
    table.add_column("Episodes", justify="right")
    for result in results:
        table.add_row(
            result.name,
            f"{result.average_utility:.2f}",
            f"{result.std_utility:.2f}",
            f"{result.average_discounted_return:.2f}",
            str(result.episodes),
        )
    console.print(table)
    return results
