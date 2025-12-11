"""Monte Carlo tree search utilities for the MuZero-style demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Sequence, Tuple

import torch

from .network import MuZeroNetwork, NetworkOutput


@dataclass
class PlannerSettings:
    """High level planner controls exposed to configuration."""

    num_simulations: int = 32
    temperature: float = 1.0


class MuZeroPlanner:
    """Lightweight planner that masks illegal actions and normalises policies."""

    def __init__(self, network: MuZeroNetwork, settings: PlannerSettings | None = None) -> None:
        self.network = network
        self.settings = settings or PlannerSettings()

    def run(self, observation: torch.Tensor, legal_actions: Sequence[int]) -> Tuple[torch.Tensor, float, int, int]:
        """Compute an action distribution for ``observation``."""

        if observation.dim() != 1:
            observation = observation.view(-1)
        with torch.no_grad():
            output: NetworkOutput = self.network.initial_inference(observation.unsqueeze(0))
        logits = output.policy_logits.squeeze(0)
        mask = torch.full_like(logits, float("-inf"))
        mask[list(legal_actions)] = 0.0
        temperature = max(self.settings.temperature, 1e-6)
        policy = torch.softmax((logits + mask) / temperature, dim=-1)
        value = float(output.value.squeeze().item())
        action = int(policy.argmax().item())
        return policy, value, action, self.settings.num_simulations

    @staticmethod
    def normalise_visit_counts(counts: Iterable[float]) -> List[float]:
        tensor = torch.tensor(list(counts), dtype=torch.float32)
        if tensor.sum() <= 0:
            tensor = torch.ones_like(tensor)
        tensor = tensor / tensor.sum()
        return tensor.tolist()


class _SearchNode:
    """Lightweight container mirroring the tree node interface used by the planner."""

    def __init__(self, value: float) -> None:
        self._value = value

    def value(self) -> float:
        return self._value


class MCTS:
    """Simplified Monte Carlo Tree Search used by the CLI/demo entrypoints.

    The full MuZero search is intentionally compressed here: we estimate visit counts
    directly from the policy head and propagate the scalar value for downstream
    consumers. This keeps the public API compatible with the planner while avoiding
    a heavy dependency graph for the runnable demo script.
    """

    def __init__(self, network: MuZeroNetwork, config: dict) -> None:
        self.network = network
        env_conf = config.get("environment", {})
        self.action_space = int(env_conf.get("max_jobs", 5)) + 1

    def run(self, observation: torch.Tensor, simulations: int) -> Tuple[_SearchNode, List[float]]:
        if observation.dim() != 1:
            observation = observation.view(-1)
        with torch.no_grad():
            output: NetworkOutput = self.network.initial_inference(observation.unsqueeze(0))
        policy_logits = output.policy_logits.squeeze(0)
        probabilities = torch.softmax(policy_logits, dim=-1)
        visit_counts = (probabilities * float(simulations)).tolist()
        root = _SearchNode(float(output.value.squeeze().item()))
        return root, visit_counts

    @staticmethod
    def final_policy(visit_counts: Sequence[float], temperature: float) -> List[float]:
        counts = torch.tensor(list(visit_counts), dtype=torch.float32)
        temperature = max(temperature, 1e-6)
        adjusted = counts / temperature
        adjusted = torch.nan_to_num(adjusted, nan=1.0 / max(len(visit_counts), 1), posinf=1.0, neginf=1e-6)
        probabilities = torch.softmax(adjusted, dim=0)
        return probabilities.tolist()


__all__ = ["MuZeroPlanner", "PlannerSettings", "MCTS"]
