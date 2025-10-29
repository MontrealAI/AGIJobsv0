"""MuZero-inspired economic planner for AGI Alpha Node."""
from __future__ import annotations

import logging
import math
import random
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class PlannerNode:
    state_id: str
    prior: float
    value_sum: float = 0.0
    visits: int = 0
    children: Dict[str, "PlannerNode"] = field(default_factory=dict)

    def expand(self, actions: Iterable[Tuple[str, float]]) -> None:
        for action_id, prior in actions:
            if action_id not in self.children:
                self.children[action_id] = PlannerNode(state_id=action_id, prior=prior)

    def q(self) -> float:
        return self.value_sum / self.visits if self.visits else 0.0

    def u(self, parent_visits: int, exploration: float) -> float:
        return exploration * self.prior * math.sqrt(parent_visits) / (1 + self.visits)


@dataclass(slots=True)
class PlannerResult:
    action: str
    expected_value: float
    confidence: float
    rationale: str


class MuZeroPlanner:
    def __init__(self, horizon: int, exploration_constant: float, discount_factor: float, max_rollouts: int,
                 temperature: float = 1.0) -> None:
        self.horizon = horizon
        self.exploration_constant = exploration_constant
        self.discount_factor = discount_factor
        self.max_rollouts = max_rollouts
        self.temperature = temperature

    def plan(self, root_state: str, action_space: Dict[str, float], value_fn) -> PlannerResult:
        root = PlannerNode(state_id=root_state, prior=1.0)
        root.expand(action_space.items())

        for rollout in range(self.max_rollouts):
            path: List[PlannerNode] = [root]
            node = root
            depth = 0
            while node.children and depth < self.horizon:
                best_action, node = max(
                    node.children.items(),
                    key=lambda item: item[1].q() + item[1].u(path[-1].visits + 1, self.exploration_constant),
                )
                path.append(node)
                depth += 1

            reward = value_fn(node.state_id)
            for i, visited_node in enumerate(reversed(path)):
                visited_node.visits += 1
                discounted_reward = reward * (self.discount_factor ** i)
                visited_node.value_sum += discounted_reward
                logger.debug(
                    "Updated node stats",
                    extra={
                        "state": visited_node.state_id,
                        "visits": visited_node.visits,
                        "value_sum": visited_node.value_sum,
                        "rollout": rollout,
                    },
                )

        best_action_id, best_child = max(
            root.children.items(),
            key=lambda item: item[1].visits,
        )
        expected_value = best_child.q()
        confidence = min(1.0, best_child.visits / max(1, self.max_rollouts))
        rationale = (
            f"Selected action {best_action_id} with expected value {expected_value:.4f} after {best_child.visits} visits"
        )
        logger.info("Planner completed", extra={"best_action": best_action_id, "value": expected_value,
                                                 "confidence": confidence})
        return PlannerResult(action=best_action_id, expected_value=expected_value, confidence=confidence,
                              rationale=rationale)


def default_value_fn(state_id: str) -> float:
    random.seed(hash(state_id) % (2 ** 32))
    return random.random()


__all__ = ["MuZeroPlanner", "PlannerResult", "default_value_fn"]
