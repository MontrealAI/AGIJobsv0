"""MuZero++ inspired planner for the demo."""

from __future__ import annotations

import logging
import math
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

import numpy as np

LOGGER = logging.getLogger("agi_alpha_node_demo.planner")


@dataclass
class PlannerOutcome:
    selected_action: str
    expected_value: float
    rationale: str


class MuZeroPlanner:
    def __init__(self, action_space: Iterable[str], rollout_depth: int, simulations: int, discount: float, exploration_constant: float) -> None:
        self.action_space = list(action_space)
        self.rollout_depth = rollout_depth
        self.simulations = simulations
        self.discount = discount
        self.exploration_constant = exploration_constant
        LOGGER.debug(
            "Planner configured",
            extra={
                "actions": self.action_space,
                "rollout_depth": rollout_depth,
                "simulations": simulations,
                "discount": discount,
                "c": exploration_constant,
            },
        )

    def plan(self, job_features: Dict[str, float]) -> PlannerOutcome:
        q_values = {action: 0.0 for action in self.action_space}
        visit_counts = {action: 0 for action in self.action_space}

        for simulation in range(self.simulations):
            path = []
            total_reward = 0.0
            discount = 1.0

            for depth in range(self.rollout_depth):
                action = self._select_action(q_values, visit_counts, depth)
                reward = self._simulate_reward(action, job_features, depth)
                path.append((action, reward))
                total_reward += discount * reward
                discount *= self.discount

            best_action = max(path, key=lambda item: item[1])[0]
            visit_counts[best_action] += 1
            q_values[best_action] += (total_reward - q_values[best_action]) / max(1, visit_counts[best_action])

            LOGGER.debug(
                "Simulation %d complete", simulation,
                extra={"path": path, "total_reward": total_reward, "best_action": best_action},
            )

        action = max(self.action_space, key=lambda a: q_values[a])
        rationale = f"Selected {action} after {self.simulations} simulations"
        LOGGER.info("Planner selected action", extra={"action": action, "value": q_values[action]})
        return PlannerOutcome(selected_action=action, expected_value=q_values[action], rationale=rationale)

    def _select_action(self, q_values: Dict[str, float], visit_counts: Dict[str, int], depth: int) -> str:
        log_total = math.log(sum(visit_counts.values()) + 1)
        best_score = float("-inf")
        best_action = None
        for action in self.action_space:
            prior = self._policy_prior(action, depth)
            count = visit_counts[action] + 1
            exploitation = q_values[action]
            exploration = self.exploration_constant * prior * math.sqrt(log_total / count)
            score = exploitation + exploration
            if score > best_score:
                best_score = score
                best_action = action
        assert best_action is not None
        return best_action

    def _simulate_reward(self, action: str, job_features: Dict[str, float], depth: int) -> float:
        weight = np.array([job_features.get("alpha", 1.0), job_features.get("risk", 0.5)])
        action_vector = np.array([random.random(), random.random()])
        synergy = float(np.dot(weight, action_vector))
        decay = self.discount ** depth
        noise = random.gauss(0, 0.1)
        reward = max(0.0, synergy * decay + noise)
        LOGGER.debug("Simulated reward", extra={"action": action, "reward": reward, "depth": depth})
        return reward

    def _policy_prior(self, action: str, depth: int) -> float:
        entropy = random.random()
        depth_factor = math.exp(-depth / max(1, self.rollout_depth))
        return 0.5 * entropy + 0.5 * depth_factor
