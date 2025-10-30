"""Evaluation routines for MuZero demo."""
from __future__ import annotations

from typing import Dict, List, Tuple

import torch

from .environment import JobsEnvironment
from .planner import MuZeroPlanner
from .network import MuZeroNetwork
from .telemetry import summarise_runs


def greedy_policy(env: JobsEnvironment, bias: float) -> int:
    best_action = 0
    best_score = float("-inf")
    for idx, job in enumerate(env._jobs):  # pylint: disable=protected-access
        score = job.gmv - (1 + bias) * job.cost
        if score > best_score:
            best_score = score
            best_action = idx
    return best_action


def policy_head_action(network: MuZeroNetwork, observation: List[float], temperature: float, device: torch.device) -> int:
    obs = torch.tensor(observation, dtype=torch.float32, device=device)
    output = network.initial_inference(obs)
    policy = torch.softmax(output.policy_logits.squeeze(0) / max(temperature, 1e-6), dim=-1)
    return int(torch.multinomial(policy, 1).item())


def run_strategy(env_config: Dict, config: Dict, network: MuZeroNetwork, device: torch.device, strategy: str) -> float:
    env = JobsEnvironment(config)
    env.seed(config.get("experiment", {}).get("seed", 17))
    total_return = 0.0
    discount = float(config.get("environment", {}).get("discount", 0.997))
    episodes = int(config.get("experiment", {}).get("evaluation_episodes", 32))
    bias = float(config.get("baselines", {}).get("greedy_immediacy_bias", 0.05))
    policy_temp = float(config.get("baselines", {}).get("policy_temperature", 0.7))
    planner = MuZeroPlanner(config, network, device)
    for episode in range(episodes):
        env.reset()
        planner.reset_episode()
        observation = env.observe()
        discount_power = 1.0
        episode_return = 0.0
        while not env.done:
            if strategy == "muzero":
                action, policy, meta = planner.plan(env, observation)
            elif strategy == "greedy":
                action = greedy_policy(env, bias)
            else:
                action = policy_head_action(network, observation, policy_temp, device)
            next_obs, reward, done, info = env.step(action)
            episode_return += reward * discount_power
            discount_power *= discount
            observation = next_obs
        total_return += episode_return
    return total_return / max(episodes, 1)


def compare_strategies(config: Dict, network: MuZeroNetwork, device: torch.device) -> Dict[str, float]:
    results = {}
    for strategy in ["muzero", "greedy", "policy"]:
        results[strategy] = run_strategy(config.get("environment", {}), config, network, device, strategy)
    return results
