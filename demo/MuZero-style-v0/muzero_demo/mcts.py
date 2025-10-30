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


__all__ = ["MuZeroPlanner", "PlannerSettings"]
