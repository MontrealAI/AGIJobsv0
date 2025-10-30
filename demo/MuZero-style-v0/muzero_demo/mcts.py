"""Monte Carlo Tree Search implementation aligned with MuZero."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import math
import torch

from .network import MuZeroNetwork


@dataclass
class PlannerSettings:
    num_simulations: int = 64
    discount: float = 0.997
    dirichlet_alpha: float = 0.3
    dirichlet_fraction: float = 0.25
    exploration_constant: float = 1.25
    temperature: float = 1.0
    max_depth: int = 12


class SearchNode:
    def __init__(self, prior: float) -> None:
        self.prior = prior
        self.visit_count = 0
        self.value_sum = 0.0
        self.children: Dict[int, "SearchNode"] = {}
        self.reward: float = 0.0
        self.hidden_state: Optional[torch.Tensor] = None

    @property
    def value(self) -> float:
        if self.visit_count == 0:
            return 0.0
        return self.value_sum / self.visit_count


class MuZeroPlanner:
    def __init__(self, network: MuZeroNetwork, settings: PlannerSettings) -> None:
        self.network = network
        self.settings = settings
        self._min_q = float("inf")
        self._max_q = float("-inf")

    def _reset_q_bounds(self) -> None:
        self._min_q = float("inf")
        self._max_q = float("-inf")

    def run(self, observation: torch.Tensor, legal_actions: List[int]) -> Tuple[torch.Tensor, float, Dict[int, SearchNode]]:
        self._reset_q_bounds()
        policy_logits, value, hidden_state = self.network.initial_inference(observation.unsqueeze(0))
        policy_probs = torch.softmax(policy_logits, dim=-1)[0]
        root = SearchNode(prior=1.0)
        root.hidden_state = hidden_state
        for action in legal_actions:
            root.children[action] = SearchNode(prior=float(policy_probs[action]))

        self._add_exploration_noise(root)

        action_tensor = torch.zeros(1, dtype=torch.long, device=observation.device)
        for _ in range(self.settings.num_simulations):
            node = root
            search_path = [node]
            current_hidden = hidden_state
            depth = 0
            value_estimate: Optional[float] = None
            while node.children and depth < self.settings.max_depth:
                action, next_node = self._select_child(node)
                search_path.append(next_node)
                action_tensor.fill_(action)
                if next_node.hidden_state is None:
                    policy_logits, value, reward, next_state = self.network.recurrent_inference(current_hidden, action_tensor)
                    next_node.hidden_state = next_state
                    next_node.reward = float(reward.item())
                    policy = torch.softmax(policy_logits, dim=-1)[0]
                    for next_action in range(policy.shape[-1]):
                        next_node.children.setdefault(next_action, SearchNode(prior=float(policy[next_action].item())))
                    value_estimate = float(value.item())
                    break
                current_hidden = next_node.hidden_state
                node = next_node
                depth += 1
            if value_estimate is None:
                value_estimate = search_path[-1].value
            self._backpropagate(search_path, value_estimate)

        visits = torch.zeros_like(policy_logits[0])
        for action, child in root.children.items():
            visits[action] = child.visit_count
        policy_target = visits ** (1.0 / max(1e-6, self.settings.temperature))
        total = policy_target.sum()
        if total <= 0:
            policy_target = torch.ones_like(policy_target) / policy_target.numel()
        else:
            policy_target = policy_target / total
        return policy_target, float(value.item()), root.children

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _add_exploration_noise(self, node: SearchNode) -> None:
        if not node.children:
            return
        actions = list(node.children.keys())
        noise = torch.distributions.dirichlet.Dirichlet(torch.full((len(actions),), self.settings.dirichlet_alpha)).sample().tolist()
        for action, eta in zip(actions, noise):
            child = node.children[action]
            child.prior = child.prior * (1 - self.settings.dirichlet_fraction) + eta * self.settings.dirichlet_fraction

    def _select_child(self, node: SearchNode) -> Tuple[int, SearchNode]:
        best_score = float("-inf")
        best_action = -1
        best_child = None
        total_visits = sum(child.visit_count for child in node.children.values())
        for action, child in node.children.items():
            score = self._ucb_score(total_visits, child)
            if score > best_score:
                best_score = score
                best_action = action
                best_child = child
        assert best_child is not None
        return best_action, best_child

    def _ucb_score(self, parent_visits: int, child: SearchNode) -> float:
        q = child.reward + self.settings.discount * child.value
        exploration_term = self.settings.exploration_constant * child.prior * math.sqrt(parent_visits + 1) / (child.visit_count + 1)
        normalized_q = self._normalize_q(q)
        return normalized_q + exploration_term

    def _normalize_q(self, q: float) -> float:
        if q < self._min_q:
            self._min_q = q
        if q > self._max_q:
            self._max_q = q
        if self._max_q > self._min_q:
            return (q - self._min_q) / (self._max_q - self._min_q)
        return 0.5

    def _backpropagate(self, search_path: List[SearchNode], value: float) -> None:
        for node in reversed(search_path):
            node.value_sum += value
            node.visit_count += 1
            value = node.reward + self.settings.discount * value
