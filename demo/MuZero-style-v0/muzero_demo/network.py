"""Neural network architecture implementing MuZero's h, g and f heads."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

import torch
from torch import nn


@dataclass
class NetworkConfig:
    observation_dim: int
    action_space_size: int
    latent_dim: int = 64
    hidden_dim: int = 128
    reward_support: Tuple[float, float] = (-20.0, 200.0)


class RepresentationNetwork(nn.Module):
    def __init__(self, config: NetworkConfig) -> None:
        super().__init__()
        self.trunk = nn.Sequential(
            nn.Linear(config.observation_dim, config.hidden_dim),
            nn.LayerNorm(config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, config.latent_dim),
        )

    def forward(self, observation: torch.Tensor) -> torch.Tensor:
        return torch.tanh(self.trunk(observation))


class DynamicsNetwork(nn.Module):
    def __init__(self, config: NetworkConfig) -> None:
        super().__init__()
        self.action_embedding = nn.Embedding(config.action_space_size, config.latent_dim)
        self.core = nn.Sequential(
            nn.Linear(config.latent_dim * 2, config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, config.latent_dim + 1),
        )

    def forward(self, hidden_state: torch.Tensor, action: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        action_embed = self.action_embedding(action)
        stacked = torch.cat([hidden_state, action_embed], dim=-1)
        transition = self.core(stacked)
        next_state, reward = transition[..., :-1], transition[..., -1:]
        return torch.tanh(next_state), reward.squeeze(-1)


class PredictionNetwork(nn.Module):
    def __init__(self, config: NetworkConfig) -> None:
        super().__init__()
        self.policy_head = nn.Sequential(
            nn.Linear(config.latent_dim, config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, config.action_space_size),
        )
        self.value_head = nn.Sequential(
            nn.Linear(config.latent_dim, config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, 1),
        )

    def forward(self, hidden_state: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        policy_logits = self.policy_head(hidden_state)
        value = torch.tanh(self.value_head(hidden_state))
        return policy_logits, value.squeeze(-1)


class MuZeroNetwork(nn.Module):
    """End-to-end MuZero architecture exposing inference helpers."""

    def __init__(self, config: NetworkConfig) -> None:
        super().__init__()
        self.config = config
        self.representation = RepresentationNetwork(config)
        self.dynamics = DynamicsNetwork(config)
        self.prediction = PredictionNetwork(config)

    @torch.no_grad()
    def initial_inference(self, observation: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        hidden_state = self.representation(observation)
        policy_logits, value = self.prediction(hidden_state)
        return policy_logits, value, hidden_state

    @torch.no_grad()
    def recurrent_inference(self, hidden_state: torch.Tensor, action: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        next_state, reward = self.dynamics(hidden_state, action)
        policy_logits, value = self.prediction(next_state)
        return policy_logits, value, reward, next_state

    def loss(self, predictions: dict, targets: dict, weights: dict) -> torch.Tensor:
        log_policy = nn.functional.log_softmax(predictions["policy_logits"], dim=-1)
        policy_loss = -(targets["policy"] * log_policy).sum(dim=-1)
        value_loss = nn.functional.mse_loss(predictions["value"], targets["value"], reduction="none")
        reward_loss = nn.functional.mse_loss(predictions["reward"], targets["reward"], reduction="none")
        loss = weights["policy"] * policy_loss + weights["value"] * value_loss + weights["reward"] * reward_loss
        return loss.mean()


def make_network(config: NetworkConfig) -> MuZeroNetwork:
    network = MuZeroNetwork(config)
    for module in network.modules():
        if isinstance(module, nn.Linear):
            nn.init.xavier_uniform_(module.weight)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
    return network
