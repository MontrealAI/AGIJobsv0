"""Baseline strategies for comparison with the MuZero planner."""
from __future__ import annotations

from typing import Callable, Dict, List

import torch

from .environment import AGIJobsPlanningEnv, PlannerObservation
from .network import MuZeroNetwork


def greedy_policy(observation: PlannerObservation) -> int:
    """Select the action with maximal immediate expected utility."""

    best_action = observation.legal_actions[-1]  # default skip
    best_score = float("-inf")
    for action in observation.legal_actions:
        if action not in observation.action_metadata:
            continue
        metadata = observation.action_metadata[action]
        if "reward" not in metadata:
            continue
        score = metadata["success_probability"] * metadata["reward"] - metadata["cost"]
        if score > best_score:
            best_action = action
            best_score = score
    return best_action


def policy_head_action(network: MuZeroNetwork, observation: torch.Tensor, legal_actions: List[int]) -> int:
    network.eval()
    with torch.no_grad():
        policy_logits, _, _ = network.initial_inference(observation.unsqueeze(0))
    policy = torch.softmax(policy_logits, dim=-1)[0]
    mask = torch.zeros_like(policy)
    mask[legal_actions] = 1
    masked_policy = policy * mask
    if masked_policy.sum() <= 0:
        return legal_actions[-1]
    return int(torch.argmax(masked_policy).item())


def rollout(env: AGIJobsPlanningEnv, action_selector: Callable[[PlannerObservation], int]) -> Dict[str, float]:
    observation = env.reset()
    done = False
    total = 0.0
    steps = 0
    while not done:
        action = action_selector(observation)
        result = env.step(action)
        total += result.reward
        observation = result.observation
        done = result.done
        steps += 1
    summary = env.summarize_history()
    summary.update({"total_steps": steps, "total_reward": total})
    return summary
