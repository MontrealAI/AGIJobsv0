"""Neural network components for the MuZero-style demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class NetworkConfig:
    """Hyper-parameters describing the MuZero-style network."""

    observation_dim: int
    action_space_size: int
    latent_dim: int = 64
    hidden_dim: int = 128


@dataclass
class NetworkOutput:
    """Structured output produced by the network blocks."""

    policy_logits: torch.Tensor
    value: torch.Tensor
    reward: torch.Tensor
    hidden_state: torch.Tensor

    def __iter__(self):
        yield self.policy_logits
        yield self.value
        yield self.hidden_state


class RepresentationNet(nn.Module):
    def __init__(self, observation_dim: int, latent_dim: int, hidden_dim: int) -> None:
        super().__init__()
        self.fc1 = nn.Linear(observation_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, latent_dim)

    def forward(self, observation: torch.Tensor) -> torch.Tensor:
        x = F.relu(self.fc1(observation))
        return torch.tanh(self.fc2(x))


class DynamicsNet(nn.Module):
    def __init__(self, latent_dim: int, hidden_dim: int, action_dim: int) -> None:
        super().__init__()
        self.action_embed = nn.Embedding(action_dim, hidden_dim)
        self.fc1 = nn.Linear(latent_dim + hidden_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, latent_dim)
        self.reward_head = nn.Linear(hidden_dim, 1)

    def forward(self, hidden_state: torch.Tensor, action: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        action_embedding = self.action_embed(action)
        x = torch.cat([hidden_state, action_embedding], dim=-1)
        x = F.relu(self.fc1(x))
        next_hidden = torch.tanh(self.fc2(x))
        reward = torch.tanh(self.reward_head(x))
        return next_hidden, reward


class PredictionNet(nn.Module):
    def __init__(self, latent_dim: int, hidden_dim: int, action_dim: int) -> None:
        super().__init__()
        self.fc1 = nn.Linear(latent_dim, hidden_dim)
        self.policy_head = nn.Linear(hidden_dim, action_dim)
        self.value_head = nn.Linear(hidden_dim, 1)

    def forward(self, hidden_state: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        x = F.relu(self.fc1(hidden_state))
        policy_logits = self.policy_head(x)
        value = torch.tanh(self.value_head(x))
        return policy_logits, value


class MuZeroNetwork(nn.Module):
    """Container module implementing representation, dynamics and prediction."""

    def __init__(self, config: NetworkConfig) -> None:
        super().__init__()
        self.config = config
        self.representation = RepresentationNet(config.observation_dim, config.latent_dim, config.hidden_dim)
        self.dynamics = DynamicsNet(config.latent_dim, config.hidden_dim, config.action_space_size)
        self.prediction = PredictionNet(config.latent_dim, config.hidden_dim, config.action_space_size)

    def initial_inference(self, observation: torch.Tensor) -> NetworkOutput:
        if observation.dim() == 1:
            observation = observation.unsqueeze(0)
        hidden = self.representation(observation)
        policy_logits, value = self.prediction(hidden)
        reward = torch.zeros_like(value)
        return NetworkOutput(policy_logits=policy_logits, value=value, reward=reward, hidden_state=hidden)

    def recurrent_inference(self, hidden_state: torch.Tensor, action: torch.Tensor) -> NetworkOutput:
        if hidden_state.dim() == 1:
            hidden_state = hidden_state.unsqueeze(0)
        if action.dim() == 0:
            action = action.unsqueeze(0)
        next_hidden, reward = self.dynamics(hidden_state, action)
        policy_logits, value = self.prediction(next_hidden)
        return NetworkOutput(policy_logits=policy_logits, value=value, reward=reward, hidden_state=next_hidden)


def make_network(config: NetworkConfig) -> MuZeroNetwork:
    """Factory helper returning an appropriately configured network."""

    return MuZeroNetwork(config)


__all__ = ["NetworkConfig", "NetworkOutput", "MuZeroNetwork", "make_network"]
