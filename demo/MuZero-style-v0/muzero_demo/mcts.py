"""MuZero Monte Carlo Tree Search implementation."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import math

import torch

from .network import MuZeroNetwork, MuZeroNetworkOutput


def softmax_temperature(logits: torch.Tensor, temperature: float) -> torch.Tensor:
    if temperature <= 0.0:
        return torch.zeros_like(logits).scatter_(0, torch.argmax(logits), 1.0)
    scaled = logits / temperature
    return torch.softmax(scaled, dim=-1)


@dataclass
class MinMaxStats:
    min_value: float = float("inf")
    max_value: float = float("-inf")

    def update(self, value: float) -> None:
        self.min_value = min(self.min_value, value)
        self.max_value = max(self.max_value, value)

    def normalize(self, value: float) -> float:
        if self.max_value > self.min_value:
            return (value - self.min_value) / (self.max_value - self.min_value)
        return value


class Node:
    def __init__(self, prior: float, hidden_state: torch.Tensor) -> None:
        self.prior = prior
        self.hidden_state = hidden_state
        self.value_sum = 0.0
        self.visit_count = 0
        self.children: Dict[int, "Node"] = {}
        self.reward = 0.0
        self.is_expanded = False

    def value(self) -> float:
        if self.visit_count == 0:
            return 0.0
        return self.value_sum / self.visit_count

    def expand(self, actions: List[int], outputs: MuZeroNetworkOutput) -> None:
        self.is_expanded = True
        policy = torch.softmax(outputs.policy_logits, dim=-1).squeeze(0)
        for action in actions:
            self.children[action] = Node(prior=float(policy[action].item()), hidden_state=outputs.hidden_state)
        self.reward = float(outputs.reward.squeeze(0).item())
        self.value_sum += float(outputs.value.squeeze(0).item())
        self.visit_count += 1


class MCTS:
    def __init__(self, network: MuZeroNetwork, config: Dict) -> None:
        self.network = network
        planner_conf = config.get("planner", {})
        self.num_actions = int(config.get("environment", {}).get("job_pool_size", network.action_dim))
        self.exploration_constant = float(planner_conf.get("exploration_constant", 1.5))
        self.dirichlet_alpha = float(planner_conf.get("dirichlet_alpha", 0.3))
        self.dirichlet_epsilon = float(planner_conf.get("dirichlet_epsilon", 0.25))
        self.temperature = float(planner_conf.get("temperature", 1.0))
        self.min_max_stats = MinMaxStats()
        self.discount = float(config.get("environment", {}).get("discount", 0.997))

    def _apply_dirichlet_noise(self, priors: torch.Tensor) -> torch.Tensor:
        if self.dirichlet_epsilon <= 0.0:
            return priors
        noise = torch.distributions.Dirichlet(torch.full_like(priors, self.dirichlet_alpha)).sample()
        return (1 - self.dirichlet_epsilon) * priors + self.dirichlet_epsilon * noise

    def run(self, observation: torch.Tensor, num_simulations: int) -> Tuple[Node, List[float]]:
        network_output = self.network.initial_inference(observation)
        policy = torch.softmax(network_output.policy_logits, dim=-1).squeeze(0)
        noisy_prior = self._apply_dirichlet_noise(policy)
        root = Node(prior=1.0, hidden_state=network_output.hidden_state)
        for action in range(self.num_actions):
            child = Node(prior=float(noisy_prior[action].item()), hidden_state=network_output.hidden_state)
            root.children[action] = child
        root.is_expanded = True
        root.reward = float(network_output.reward.squeeze(0).item())
        root.value_sum = float(network_output.value.squeeze(0).item())
        root.visit_count = 1

        for _ in range(num_simulations):
            node = root
            search_path = [node]
            actions_path: List[int] = []
            # Selection
            while node.is_expanded and node.children:
                action, node = self._select_child(node)
                actions_path.append(action)
                search_path.append(node)
            # Expansion
            parent = search_path[-2] if len(search_path) > 1 else root
            action_tensor = torch.tensor([actions_path[-1]] if actions_path else [0], dtype=torch.long)
            network_output = self.network.recurrent_inference(parent.hidden_state, action_tensor)
            node.hidden_state = network_output.hidden_state
            node.reward = float(network_output.reward.squeeze(0).item())
            policy = torch.softmax(network_output.policy_logits, dim=-1).squeeze(0)
            for action in range(self.num_actions):
                node.children[action] = Node(prior=float(policy[action].item()), hidden_state=network_output.hidden_state)
            node.is_expanded = True
            # Backpropagation
            value = float(network_output.value.squeeze(0).item())
            self.min_max_stats.update(value)
            for back_node in reversed(search_path):
                back_node.value_sum += value
                back_node.visit_count += 1
                value = back_node.reward + self.discount * value
        visit_counts = [root.children[a].visit_count if a in root.children else 0 for a in range(self.num_actions)]
        return root, visit_counts

    def _select_child(self, node: Node) -> Tuple[int, Node]:
        total_visits = sum(child.visit_count for child in node.children.values()) + 1
        best_score = float("-inf")
        best_action = 0
        best_child = next(iter(node.children.values()))
        for action, child in node.children.items():
            q_value = child.value()
            self.min_max_stats.update(q_value)
            normalized_q = self.min_max_stats.normalize(q_value)
            u_score = self._puct_score(node.visit_count, child.prior, child.visit_count)
            score = normalized_q + u_score
            if score > best_score:
                best_score = score
                best_action = action
                best_child = child
        return best_action, best_child

    def _puct_score(self, parent_visits: int, prior: float, child_visits: int) -> float:
        return self.exploration_constant * prior * math.sqrt(parent_visits + 1) / (1 + child_visits)

    def final_policy(self, visit_counts: List[float], temperature: float) -> List[float]:
        visits = torch.tensor(visit_counts, dtype=torch.float32)
        if temperature == 0.0:
            best = torch.argmax(visits).item()
            policy = [0.0 for _ in visit_counts]
            policy[best] = 1.0
            return policy
        scaled = visits ** (1.0 / max(temperature, 1e-6))
        scaled_sum = scaled.sum().item()
        if scaled_sum <= 0.0:
            return [1.0 / len(visit_counts) for _ in visit_counts]
        return [(val / scaled_sum) for val in scaled.tolist()]
