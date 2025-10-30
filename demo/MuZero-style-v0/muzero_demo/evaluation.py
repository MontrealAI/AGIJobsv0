"""Evaluation helpers comparing MuZero with baseline strategies."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List, Optional

import numpy as np
import torch
from rich.console import Console
from rich.table import Table

from .baselines import greedy_policy, policy_head_action
from .environment import AGIJobsPlanningEnv, EnvironmentConfig
from .mcts import MuZeroPlanner, PlannerSettings
from .network import MuZeroNetwork
from .thermostat import PlanningThermostat
from .sentinel import SentinelMonitor
from .training import Episode
from .utils import discounted_returns


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
    thermostat: Optional[PlanningThermostat] = None,
    sentinel: Optional[SentinelMonitor] = None,
) -> List[EvaluationResult]:
    console = console or Console()
    console.rule("[bold cyan]MuZero Economic Impact Evaluation")

    env = AGIJobsPlanningEnv(env_config)
    planner = MuZeroPlanner(network, planner_settings)

    strategies: List[tuple[str, Callable]] = [
        ("MuZero Planner", None),
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
            episode_record: Optional[Episode] = None
            if name == "MuZero Planner":
                records = {
                    "observations": [],
                    "actions": [],
                    "rewards": [],
                    "policies": [],
                    "values": [],
                    "simulations": [],
                }
            while not done:
                if name == "MuZero Planner":
                    obs_tensor = torch.from_numpy(observation.vector).float()
                    initial = network.initial_inference(obs_tensor.unsqueeze(0))
                    policy_logits, root_val_tensor, hidden_state = initial
                    policy_probs = torch.softmax(policy_logits, dim=-1)[0]
                    dynamic_sim = None
                    if thermostat:
                        dynamic_sim = thermostat.recommend(observation, policy_probs, observation.legal_actions)
                    policy, root_value, _, sims_used = planner.run(
                        obs_tensor,
                        observation.legal_actions,
                        initial_inference=(policy_logits, root_val_tensor, hidden_state),
                        num_simulations=dynamic_sim,
                    )
                    if thermostat:
                        thermostat.observe(sims_used, root_value)
                    mask = torch.zeros_like(policy)
                    mask[observation.legal_actions] = 1.0
                    masked_policy = policy * mask
                    if masked_policy.sum() <= 0:
                        action = observation.legal_actions[-1]
                    else:
                        action = int(torch.argmax(masked_policy).item())
                    records["observations"].append(observation.vector.copy())
                    records["actions"].append(action)
                    records["policies"].append(policy.cpu().numpy())
                    records["values"].append(root_value)
                    records["simulations"].append(sims_used)
                else:
                    assert policy_fn is not None
                    action = policy_fn(observation)
                step = env.step(action)
                total_utility += step.reward
                if name == "MuZero Planner":
                    records["rewards"].append(step.reward)
                observation = step.observation
                done = step.done
            history = env.summarize_history()
            utilities.append(total_utility)
            discounted.append(history["discounted_return"])
            if name == "MuZero Planner" and sentinel:
                returns = discounted_returns(records["rewards"], env_config.discount)
                episode_record = Episode(
                    observations=records["observations"],
                    actions=records["actions"],
                    rewards=records["rewards"],
                    policies=records["policies"],
                    values=records["values"],
                    returns=returns,
                    simulations=records["simulations"],
                    summary=history,
                )
                sentinel.record_episode(episode_record)
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
